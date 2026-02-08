import Link from "next/link";

export default function Home() {
  return (
    <div className="container" style={{ paddingTop: 48 }}>
      <h1 style={{ marginBottom: 8 }}>Lens Capture</h1>
      <p style={{ color: "#6b7280", marginBottom: 24 }}>
        Save products and locations from the extension, then review them here.
      </p>
      <Link href="/login" className="btn">
        Log in
      </Link>
      {" "}
      <Link href="/dashboard" className="btn btn-secondary">
        Dashboard
      </Link>
    </div>
  );
}
