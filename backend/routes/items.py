"""
In-memory store for saved items (MVP). Replace with DB (e.g. Supabase) for production.
"""
import uuid
from pydantic import BaseModel
from typing import Any

# user_id -> list of items
_store: dict[str, list[dict]] = {}


class SaveItemRequest(BaseModel):
    type: str  # "product" | "location"
    title: str
    description: str = ""
    metadata: dict[str, Any] = {}
    source_url: str = ""


def _ensure_user(user_id: str) -> None:
    if user_id not in _store:
        _store[user_id] = []


async def save_item(body: SaveItemRequest, user_id: str) -> dict:
    _ensure_user(user_id)
    item = {
        "id": str(uuid.uuid4()),
        "type": body.type,
        "title": body.title,
        "description": body.description,
        "metadata": body.metadata,
        "source_url": body.source_url,
    }
    _store[user_id].append(item)
    return {"id": item["id"]}


async def list_items(user_id: str) -> dict:
    _ensure_user(user_id)
    return {"items": _store[user_id]}
