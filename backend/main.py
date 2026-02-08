"""
Backend API for Lens Capture / entertainment media scanner.
- POST /analyze: image + intent → vision description + product/location results
- POST /items: save an item (product or location)
- GET /items: list saved items for the authenticated user
"""
from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware

from config import DEDALUS_API_KEY, REQUIRE_AUTH
from routes import analyze, items

app = FastAPI(
    title="Lens Capture API",
    description="Analyze on-screen media and save products/locations",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_user_id(authorization: str | None = Header(default=None)) -> str | None:
    """Extract user from Bearer token. MVP: token value is treated as user_id."""
    if not REQUIRE_AUTH:
        return "default-user"
    if not authorization or not authorization.startswith("Bearer "):
        return None
    return authorization.replace("Bearer ", "").strip() or None


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/analyze")
async def analyze_image(
    body: analyze.AnalyzeRequest,
    user_id: str | None = Depends(get_user_id),
):
    if REQUIRE_AUTH and not user_id:
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    return await analyze.analyze(body, user_id, DEDALUS_API_KEY)


@app.post("/items")
async def save_item(
    body: items.SaveItemRequest,
    user_id: str | None = Depends(get_user_id),
):
    if REQUIRE_AUTH and not user_id:
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    return await items.save_item(body, user_id)


@app.get("/items")
async def list_items(user_id: str | None = Depends(get_user_id)):
    if REQUIRE_AUTH and not user_id:
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    return await items.list_items(user_id)


@app.delete("/items/{item_id}")
async def delete_item(
    item_id: str,
    user_id: str | None = Depends(get_user_id),
):
    if REQUIRE_AUTH and not user_id:
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    if not await items.delete_item(item_id, user_id):
        raise HTTPException(status_code=404, detail="Item not found")
    return {"status": "deleted"}


if __name__ == "__main__":
    import uvicorn
    from config import HOST, PORT
    uvicorn.run("main:app", host=HOST, port=PORT, reload=True)
