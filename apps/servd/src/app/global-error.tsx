"use client";

import { useEffect } from "react";

/**
 * The last line of defence: an error thrown by the root layout itself, which
 * the per-route boundary can't catch because it lives inside that layout.
 *
 * It has to render its own <html> and <body>, and it must not depend on the
 * app's fonts, providers or CSS variables — whatever broke may be exactly
 * those. Everything here is inline for that reason.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Fatal UI error", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#fff6ec",
          color: "#2b1124",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <div style={{ fontSize: 40 }}>😕</div>
          <h1 style={{ margin: "12px 0 0", fontSize: 20 }}>Something went wrong</h1>
          <p style={{ margin: "8px 0 0", opacity: 0.65, fontSize: 14, lineHeight: 1.5 }}>
            Your data is safe. Reload the page to carry on.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: 20,
              width: "100%",
              padding: "12px 16px",
              borderRadius: 999,
              border: "none",
              cursor: "pointer",
              color: "#fff",
              fontWeight: 700,
              fontSize: 15,
              background: "linear-gradient(135deg,#ff9a2e 0%,#ff7a1a 52%,#ff4d6d 100%)",
            }}
          >
            Reload
          </button>
          {error.digest && (
            <p style={{ marginTop: 16, fontSize: 11, opacity: 0.4, fontFamily: "monospace" }}>
              Reference: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
