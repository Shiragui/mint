"""
SQLite-based storage for users and bookmarks.
"""
import json
import sqlite3
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

DB_PATH = Path(__file__).resolve().parent / "lens.db"


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_conn()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS bookmarks (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            image_base64 TEXT,
            description TEXT,
            results_json TEXT,
            source_url TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON bookmarks(user_id);
    """)
    conn.commit()
    conn.close()


def create_user(username: str, password_hash: str) -> str:
    conn = get_conn()
    uid = str(uuid.uuid4())
    conn.execute(
        "INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)",
        (uid, username.lower(), password_hash),
    )
    conn.commit()
    conn.close()
    return uid


def get_user_by_username(username: str) -> Optional[Dict]:
    conn = get_conn()
    row = conn.execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?",
        (username.lower(),),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def create_bookmark(user_id: str, image_base64: str, description: str, results: List[Dict], source_url: Optional[str] = None) -> str:
    conn = get_conn()
    bid = str(uuid.uuid4())
    conn.execute(
        "INSERT INTO bookmarks (id, user_id, image_base64, description, results_json, source_url) VALUES (?, ?, ?, ?, ?, ?)",
        (bid, user_id, image_base64, description, json.dumps(results), source_url or ""),
    )
    conn.commit()
    conn.close()
    return bid


def get_bookmarks(user_id: str) -> List[Dict]:
    conn = get_conn()
    rows = conn.execute(
        "SELECT id, image_base64, description, results_json, source_url, created_at FROM bookmarks WHERE user_id = ? ORDER BY created_at DESC",
        (user_id,),
    ).fetchall()
    conn.close()
    out = []
    for r in rows:
        d = dict(r)
        try:
            d["results"] = json.loads(d["results_json"]) if d["results_json"] else []
        except (json.JSONDecodeError, TypeError):
            d["results"] = []
        del d["results_json"]
        out.append(d)
    return out


def get_bookmark(bookmark_id: str, user_id: str) -> Optional[Dict]:
    conn = get_conn()
    row = conn.execute(
        "SELECT id, image_base64, description, results_json, source_url, created_at FROM bookmarks WHERE id = ? AND user_id = ?",
        (bookmark_id, user_id),
    ).fetchone()
    conn.close()
    if not row:
        return None
    d = dict(row)
    try:
        d["results"] = json.loads(d["results_json"]) if d["results_json"] else []
    except (json.JSONDecodeError, TypeError):
        d["results"] = []
    del d["results_json"]
    return d


def delete_bookmark(bookmark_id: str, user_id: str) -> bool:
    conn = get_conn()
    cur = conn.execute("DELETE FROM bookmarks WHERE id = ? AND user_id = ?", (bookmark_id, user_id))
    conn.commit()
    conn.close()
    return cur.rowcount > 0
