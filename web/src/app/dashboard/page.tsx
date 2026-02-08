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
};

export default function DashboardPage() {
  const router = useRouter();
  const [items, setItems] = useState<SavedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let token: string | null = null;
    if (typeof window !== "undefined") {
      token = localStorage.getItem(TOKEN_KEY);
    }
    if (!token) {
      router.push("/login");
      return;
    }
    fetch(`${API_URL}/items`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (r.status === 401) {
          router.push("/login");
          return null;
        }
        if (!r.ok) throw new Error(r.statusText);
        return r.json();
      })
      .then((data) => {
        if (data && Array.isArray(data.items)) setItems(data.items);
      })
      .catch((e) => setError(e.message || "Failed to load items"))
      .finally(() => setLoading(false));
  }, [router]);

  function handleLogout() {
    if (typeof window !== "undefined") {
      localStorage.removeItem(TOKEN_KEY);
    }
    router.push("/login");
  }

  async function handleDelete(id: string) {
    const token = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/items/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
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

  if (loading) {
    return (
      <div className="container" style={{ paddingTop: 48 }}>
        <p>Loading saved items…</p>
      </div>
    );
  }

  return (
    <div className="container" style={{ paddingTop: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Saved items</h1>
        <button type="button" className="btn btn-secondary" onClick={handleLogout}>
          Log out
        </button>
      </div>
      {error && (
        <p style={{ color: "#b91c1c", marginBottom: 16 }}>
          {error}. Is the backend running at {API_URL}?
        </p>
      )}
      {items.length === 0 && !error && (
        <p style={{ color: "#6b7280" }}>
          No saved items yet. Use the extension to capture a region and click “Save” on a product or location.
        </p>
      )}
      {items.map((item) => (
        <div key={item.id} className="card" style={{ position: "relative" }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(item.id);
            }}
            title="Delete"
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 4,
              fontSize: 20,
              color: "#9ca3af",
              lineHeight: 1,
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.color = "#b91c1c";
              e.currentTarget.style.background = "#fef2f2";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.color = "#9ca3af";
              e.currentTarget.style.background = "none";
            }}
            aria-label="Delete item"
          >
            ×
          </button>
          <span style={{ fontSize: 12, color: "#9ca3af", textTransform: "uppercase" }}>{item.type}</span>
          <h3>{item.title}</h3>
          {item.description && <p>{item.description}</p>}
          <div className="meta">
            {item.source_url ? (
              <a href={item.source_url} target="_blank" rel="noopener noreferrer">
                Open link
              </a>
            ) : (
              "No link"
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
