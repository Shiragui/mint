"""
Lens Capture - FastAPI webhook receiver for Chrome Extension.
Accepts image/description/metadata and saves to Snowflake via SQL API.
Includes user auth and bookmarks for the web frontend.
"""
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import APIKeyHeader, OAuth2PasswordBearer
from pydantic import BaseModel, Field

from auth import create_access_token, decode_token, hash_password, verify_password
from config import API_KEY, SECRET_KEY, ADMIN_USER, ADMIN_PASSWORD, get_snowflake_config
from db import (
    create_bookmark as db_create_bookmark,
    create_user as db_create_user,
    get_bookmark as db_get_bookmark,
    get_bookmarks as db_get_bookmarks,
    get_user_by_username,
    init_db,
)
from snowflake_client import insert_lens_vault

from fastapi import FastAPI
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

app = FastAPI(
    title="Lens Capture Webhook",
    description="Secure webhook receiver for Lens Capture Chrome Extension → Snowflake",
    version="1.0.0",
)

# Init SQLite on startup
init_db()

API_KEY_HEADER = APIKeyHeader(name="X-API-Key", auto_error=False)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


# --- Request/Response models ---

class LensPayload(BaseModel):
    image: str = Field(..., description="Base64-encoded image string")
    description: str = Field(..., description="AI-generated description")
    timestamp: Optional[str] = Field(None, description="ISO timestamp from client")
    mimeType: Optional[str] = Field(None, description="Image MIME type")

    class Config:
        extra = "allow"


class RegisterPayload(BaseModel):
    username: str
    password: str


class BookmarkPayload(BaseModel):
    image: str = Field(..., description="Base64 image")
    description: str = Field(..., description="AI description")
    similarProducts: List[Dict[str, Any]] = Field(default_factory=list)
    sourceUrl: Optional[str] = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


# --- Auth dependencies ---

def require_api_key(x_api_key: Optional[str] = Depends(API_KEY_HEADER)) -> str:
    if not API_KEY or not API_KEY.strip():
        return ""
    if not x_api_key or x_api_key.strip() != API_KEY.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key. Provide X-API-Key header.",
        )
    return x_api_key


async def require_token(token: Optional[str] = Depends(oauth2_scheme)) -> dict:
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_token(token, SECRET_KEY)
    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )
    return payload


# --- Auth endpoints ---

@app.post("/auth/register", response_model=TokenResponse)
async def register(payload: RegisterPayload):
    """Register a new user and return JWT."""
    if len(payload.username) < 2:
        raise HTTPException(status_code=400, detail="Username too short")
    if len(payload.password) < 4:
        raise HTTPException(status_code=400, detail="Password too short")
    existing = get_user_by_username(payload.username)
    if existing:
        raise HTTPException(status_code=400, detail="Username already taken")
    db_create_user(payload.username, hash_password(payload.password))
    token = create_access_token(data={"sub": payload.username}, secret=SECRET_KEY)
    return TokenResponse(access_token=token)


@app.post("/auth/login", response_model=TokenResponse)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    """Login with username and password. Returns JWT."""
    # Try DB first
    user = get_user_by_username(form_data.username)
    if user:
        if not verify_password(form_data.password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Incorrect username or password")
        token = create_access_token(data={"sub": user["username"]}, secret=SECRET_KEY)
        return TokenResponse(access_token=token)
    # Fallback to env (admin)
    if form_data.username != ADMIN_USER:
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    if ADMIN_PASSWORD.startswith("$2"):
        ok = verify_password(form_data.password, ADMIN_PASSWORD)
    else:
        ok = form_data.password == ADMIN_PASSWORD
    if not ok:
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    token = create_access_token(data={"sub": form_data.username}, secret=SECRET_KEY)
    return TokenResponse(access_token=token)


# --- Webhook ---

@app.post("/api/lens")
async def lens_webhook(
    payload: LensPayload,
    _api_key: str = Depends(require_api_key),
):
    """Webhook for extension. Saves to Snowflake LENS_VAULT."""
    cfg = get_snowflake_config()
    required = ["account_identifier", "user", "private_key_path", "warehouse", "database", "schema"]
    missing = [k for k in required if not cfg.get(k)]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Snowflake not configured: {missing}",
        )

    record_id = str(uuid.uuid4())
    metadata: Dict[str, Any] = {
        "timestamp": payload.timestamp,
        "mimeType": payload.mimeType,
    }
    extra = payload.model_dump(exclude={"image", "description", "timestamp", "mimeType"})
    metadata.update({k: v for k, v in extra.items() if v is not None})

    try:
        insert_lens_vault(
            account_identifier=cfg["account_identifier"],
            user=cfg["user"],
            private_key_path=cfg["private_key_path"],
            record_id=record_id,
            image_base64=payload.image,
            label=payload.description,
            metadata=metadata,
            warehouse=cfg["warehouse"],
            database=cfg["database"],
            schema=cfg["schema"],
            role=cfg.get("role"),
            passphrase=cfg.get("passphrase"),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Snowflake insert failed: {str(e)}",
        )

    return {"id": record_id, "status": "saved"}


# --- Bookmarks ---

@app.post("/api/bookmarks")
async def create_bookmark_endpoint(
    payload: BookmarkPayload,
    auth: dict = Depends(require_token),
):
    """Save a bookmark (from extension or web)."""
    user = get_user_by_username(auth["sub"])
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    bid = db_create_bookmark(
        user_id=user["id"],
        image_base64=payload.image,
        description=payload.description,
        results=payload.similarProducts,
        source_url=payload.sourceUrl,
    )
    return {"id": bid, "status": "saved"}


@app.get("/api/bookmarks")
async def list_bookmarks(auth: dict = Depends(require_token)):
    """List current user's bookmarks."""
    user = get_user_by_username(auth["sub"])
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    items = db_get_bookmarks(user["id"])
    return {"bookmarks": items}


@app.get("/api/bookmarks/{bookmark_id}")
async def get_bookmark_endpoint(bookmark_id: str, auth: dict = Depends(require_token)):
    """Get a single bookmark."""
    user = get_user_by_username(auth["sub"])
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    b = db_get_bookmark(bookmark_id, user["id"])
    if not b:
        raise HTTPException(status_code=404, detail="Bookmark not found")
    return b


@app.delete("/api/bookmarks/{bookmark_id}")
async def delete_bookmark_endpoint(bookmark_id: str, auth: dict = Depends(require_token)):
    """Delete a bookmark."""
    from db import delete_bookmark
    user = get_user_by_username(auth["sub"])
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if not delete_bookmark(bookmark_id, user["id"]):
        raise HTTPException(status_code=404, detail="Bookmark not found")
    return {"status": "deleted"}


@app.get("/health")
async def health():
    return {"status": "ok"}


# --- Frontend ---

STATIC_DIR = Path(__file__).resolve().parent / "static"

if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/")
async def index():
    """Serve the frontend."""
    index_path = STATIC_DIR / "index.html"
    if index_path.exists():
        return FileResponse(index_path)
    return {"message": "Lens Capture API. Go to /static/index.html for the frontend."}


@app.get("/login")
async def login_page():
    p = STATIC_DIR / "index.html"
    if p.exists():
        return FileResponse(p)
    return {"message": "Frontend not found"}


@app.get("/dashboard")
async def dashboard_page():
    p = STATIC_DIR / "index.html"
    if p.exists():
        return FileResponse(p)
    return {"message": "Frontend not found"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
