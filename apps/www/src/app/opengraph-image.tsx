import { ImageResponse } from "next/og";

/**
 * The share card.
 *
 * Most of this page's traffic arrives from a link pasted into Facebook or
 * Messenger, where the card is the whole first impression. It carries the
 * headline and nothing else — no numbers, because a number baked into a PNG
 * cannot be corrected later, and no fonts fetched at build time, because a
 * font fetch is a build that fails behind a proxy.
 */
export const runtime = "nodejs";
export const alt = "One city. One partner. Your brand, our software. — CANVEXIA";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#FAFAF8",
          padding: "72px 80px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 26,
              height: 26,
              background: "linear-gradient(135deg, #E8536A, #F2894E)",
              borderRadius: 4,
              display: "flex",
            }}
          />
          <div
            style={{
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: 6,
              color: "#1A1A1E",
              display: "flex",
            }}
          >
            CANVEXIA
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ width: 64, height: 5, background: "#E8536A", borderRadius: 99, display: "flex" }} />
          <div
            style={{
              marginTop: 32,
              fontSize: 76,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: -2,
              color: "#1A1A1E",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <span>One city. One partner.</span>
            <span>Your brand, our software.</span>
          </div>
        </div>

        <div style={{ fontSize: 26, color: "#54545C", display: "flex" }}>
          Software for Philippine local businesses — sold city by city.
        </div>
      </div>
    ),
    size,
  );
}
