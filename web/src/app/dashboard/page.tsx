"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const TOKEN_KEY = "lens_capture_token";
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type SavedItem = {
  id: string;
  type: string;
  title: string;
  description: string;
  metadata: Record<string, unknown>;
  source_url: string;
  board_id?: string;
};

type Board = {
  id: string;
  name: string;
};

export default function DashboardPage() {
  const router = useRouter();
  const [items, setItems] = useState<SavedItem[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newBoardName, setNewBoardName] = useState("");
  const [showCreateBoard, setShowCreateBoard] = useState(false);

  function getToken() {
    return typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
  }

  function fetchWithAuth(url: string, opts: RequestInit = {}) {
    const token = getToken();
    return fetch(url, {
      ...opts,
      headers: { Authorization: `Bearer ${token}`, ...opts.headers },
    });
  }

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }
    Promise.all([
      fetchWithAuth(`${API_URL}/boards`).then((r) =>
        r.ok ? r.json() : { boards: [] }
      ),
      fetchWithAuth(`${API_URL}/items`).then((r) =>
        r.ok ? r.json() : { items: [] }
      ),
    ])
      .then(([boardsData, itemsData]) => {
        const boardList = Array.isArray(boardsData.boards) ? boardsData.boards : [];
        setBoards(boardList);
        setItems(Array.isArray(itemsData.items) ? itemsData.items : []);
        if (boardList.length > 0 && !selectedBoardId) {
          setSelectedBoardId(boardList[0].id);
        }
      })
      .catch((e) => setError(e.message || "Failed to load"))
      .finally(() => setLoading(false));
  }, [router]);

  const displayedItems = selectedBoardId
    ? items.filter((i) => (i.board_id || boards[0]?.id) === selectedBoardId)
    : items;

  function handleLogout() {
    if (typeof window !== "undefined") {
      localStorage.removeItem(TOKEN_KEY);
    }
    router.push("/login");
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetchWithAuth(`${API_URL}/items/${id}`, {
        method: "DELETE",
      });
      if (res.status === 404) {
        setError("Item not found");
        return;
      }
      if (!res.ok) throw new Error(res.statusText);
      setError("");
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  async function handleMoveToBoard(itemId: string, boardId: string) {
    try {
      const res = await fetchWithAuth(`${API_URL}/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ board_id: boardId }),
      });
      if (!res.ok) throw new Error(res.statusText);
      setItems((prev) =>
        prev.map((i) =>
          i.id === itemId ? { ...i, board_id: boardId } : i
        )
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to move");
    }
  }

  async function handleCreateBoard() {
    const name = newBoardName.trim();
    if (!name) return;
    try {
      const res = await fetchWithAuth(`${API_URL}/boards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error(res.statusText);
      const data = await res.json();
      setBoards((prev) => [...prev, { id: data.id, name: data.name }]);
      setNewBoardName("");
      setShowCreateBoard(false);
      setSelectedBoardId(data.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create board");
    }
  }

  if (loading) {
    return (
      <div className="container" style={{ paddingTop: 48 }}>
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <div className="container dashboard-container" style={{ paddingTop: 24 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <h1 style={{ margin: 0 }}>MINT</h1>
        <button type="button" className="btn btn-secondary" onClick={handleLogout}>
          Log out
        </button>
      </div>
      {error && (
        <p style={{ color: "#b91c1c", marginBottom: 16 }}>
          {error}. Is the backend running at {API_URL}?
        </p>
      )}

      <div className="dashboard-layout">
        <aside className="boards-sidebar">
          <h2 style={{ fontSize: 14, fontWeight: 600, color: "#6b7280", margin: "0 0 12px" }}>
            Boards
          </h2>
          {boards.map((b) => (
            <button
              key={b.id}
              type="button"
              className={`board-tab ${selectedBoardId === b.id ? "active" : ""}`}
              onClick={() => setSelectedBoardId(b.id)}
            >
              {b.name}
            </button>
          ))}
          {showCreateBoard ? (
            <div style={{ marginTop: 8 }}>
              <input
                type="text"
                className="input"
                placeholder="Board name"
                value={newBoardName}
                onChange={(e) => setNewBoardName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateBoard()}
                autoFocus
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="btn"
                  style={{ flex: 1 }}
                  onClick={handleCreateBoard}
                >
                  Create
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowCreateBoard(false);
                    setNewBoardName("");
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="board-tab add-board"
              onClick={() => setShowCreateBoard(true)}
            >
              + New board
            </button>
          )}
        </aside>

        <main className="dashboard-main">
          {displayedItems.length === 0 && !error && (
            <p style={{ color: "#6b7280" }}>
              No items in this board. Use the extension to capture and save.
            </p>
          )}
          <div className="cards-grid">
            {displayedItems.map((item) => (
              <div key={item.id} className="card card-compact" style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(item.id);
                  }}
                  title="Delete"
                  className="card-delete-btn"
                  aria-label="Delete item"
                >
                  ×
                </button>
                <span style={{ fontSize: 12, color: "#9ca3af", textTransform: "uppercase" }}>
                  {item.type}
                </span>
                <h3>{item.title}</h3>
                {item.description && <p>{item.description}</p>}
                <div className="card-meta">
                  {item.source_url ? (
                    <a href={item.source_url} target="_blank" rel="noopener noreferrer">
                      Open link
                    </a>
                  ) : (
                    "No link"
                  )}
                </div>
                <div className="card-move">
                  <label htmlFor={`move-${item.id}`} style={{ fontSize: 12, color: "#6b7280" }}>
                    Move to:
                  </label>
                  <select
                    id={`move-${item.id}`}
                    value={item.board_id || boards[0]?.id || ""}
                    onChange={(e) => handleMoveToBoard(item.id, e.target.value)}
                    style={{
                      fontSize: 12,
                      padding: "4px 8px",
                      borderRadius: 6,
                      border: "1px solid #e5e7eb",
                      background: "#fff",
                    }}
                  >
                    {boards.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
