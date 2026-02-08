"""
In-memory store for saved items and boards (MVP). Replace with DB (e.g. Supabase) for production.
"""
import uuid
from pydantic import BaseModel
from typing import Any, Optional

_store: dict[str, list[dict]] = {}
_boards: dict[str, list[dict]] = {}
DEFAULT_BOARD_NAME = "Saved"


class SaveItemRequest(BaseModel):
    type: str
    title: str
    description: str = ""
    metadata: dict[str, Any] = {}
    source_url: str = ""
    board_id: Optional[str] = None


class CreateBoardRequest(BaseModel):
    name: str


class MoveItemRequest(BaseModel):
    board_id: str


def _ensure_user(user_id: str) -> None:
    if user_id not in _store:
        _store[user_id] = []
    if user_id not in _boards:
        _boards[user_id] = []


def _get_or_create_default_board(user_id: str) -> str:
    _ensure_user(user_id)
    boards = _boards[user_id]
    if not boards:
        board_id = str(uuid.uuid4())
        boards.append({"id": board_id, "name": DEFAULT_BOARD_NAME})
        return board_id
    return boards[0]["id"]


async def save_item(body: SaveItemRequest, user_id: str) -> dict:
    _ensure_user(user_id)
    board_id = body.board_id or _get_or_create_default_board(user_id)
    item = {
        "id": str(uuid.uuid4()),
        "type": body.type,
        "title": body.title,
        "description": body.description,
        "metadata": body.metadata,
        "source_url": body.source_url,
        "board_id": board_id,
    }
    _store[user_id].append(item)
    return {"id": item["id"], "board_id": board_id}


async def list_items(user_id: str, board_id: Optional[str] = None) -> dict:
    _ensure_user(user_id)
    default_id = _get_or_create_default_board(user_id)
    items = []
    for i in _store[user_id]:
        if "board_id" not in i:
            i["board_id"] = default_id
        items.append(i)
    if board_id:
        items = [i for i in items if i.get("board_id") == board_id]
    return {"items": items}


async def delete_item(item_id: str, user_id: str) -> bool:
    _ensure_user(user_id)
    orig_len = len(_store[user_id])
    _store[user_id] = [i for i in _store[user_id] if i["id"] != item_id]
    return len(_store[user_id]) < orig_len


async def move_item_to_board(item_id: str, board_id: str, user_id: str) -> bool:
    _ensure_user(user_id)
    for item in _store[user_id]:
        if item["id"] == item_id:
            item["board_id"] = board_id
            return True
    return False


async def list_boards(user_id: str) -> dict:
    _ensure_user(user_id)
    if not _boards[user_id]:
        _get_or_create_default_board(user_id)
    return {"boards": _boards[user_id]}


async def create_board(body: CreateBoardRequest, user_id: str) -> dict:
    _ensure_user(user_id)
    board_id = str(uuid.uuid4())
    name = body.name.strip() or "Untitled"
    _boards[user_id].append({"id": board_id, "name": name})
    return {"id": board_id, "name": name}


async def delete_board(board_id: str, user_id: str) -> dict:
    _ensure_user(user_id)
    default_id = _get_or_create_default_board(user_id)
    if board_id == default_id:
        return {"status": "cannot_delete_default"}
    _boards[user_id] = [b for b in _boards[user_id] if b["id"] != board_id]
    for item in _store[user_id]:
        if item.get("board_id") == board_id:
            item["board_id"] = default_id
    return {"status": "deleted"}
