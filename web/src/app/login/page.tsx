"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const TOKEN_KEY = "lens_capture_token";

export default function LoginPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const t = token.trim();
    if (!t) {
      setError("Enter your auth token.");
      return;
    }
    if (typeof window !== "undefined") {
      localStorage.setItem(TOKEN_KEY, t);
    }
    router.push("/dashboard");
  }

  return (
    <div className="container" style={{ paddingTop: 48, maxWidth: 400 }}>
      <h1 style={{ marginBottom: 8 }}>Log in</h1>
      <p style={{ color: "#6b7280", marginBottom: 24, fontSize: 14 }}>
        Use the same token you set in the extension options. The backend accepts any non-empty token as your user ID for this MVP.
      </p>
      <form onSubmit={handleSubmit}>
        <label className="label">Auth token</label>
        <input
          type="password"
          className="input"
          placeholder="Paste your token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          autoComplete="off"
        />
        {error && <p style={{ color: "#b91c1c", fontSize: 14, marginBottom: 12 }}>{error}</p>}
        <button type="submit" className="btn">
          Continue to dashboard
        </button>
      </form>
    </div>
  );
}
