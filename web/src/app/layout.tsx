import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lens Capture – Saved items",
  description: "View and manage items you saved from the extension",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
