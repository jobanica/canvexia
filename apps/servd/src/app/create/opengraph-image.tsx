import { ImageResponse } from "next/og";

/**
 * The share card for /create.
 *
 * Generated at build time rather than shipped as a binary, so it can't drift
 * out of sync with the page copy and there's no asset to keep in the repo. This
 * link gets pasted into Messenger threads all day — a bare URL with no card
 * reads as spam, which is an expensive way to lose traffic you paid for.
 */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Create your restaurant's online ordering page — free";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: "#fff6ec",
          padding: "80px",
          position: "relative",
        }}
      >
        {/* Gradient wash, echoing the page's hero accent. */}
        <div
          style={{
            position: "absolute",
            top: -160,
            right: -160,
            width: 620,
            height: 620,
            borderRadius: 999,
            background: "linear-gradient(135deg, #ff9a2e 0%, #ff7a1a 52%, #ff4d6d 100%)",
            opacity: 0.22,
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: "linear-gradient(135deg, #ff9a2e 0%, #ff7a1a 52%, #ff4d6d 100%)",
            }}
          />
          <div style={{ fontSize: 40, fontWeight: 800, color: "#2b1124", letterSpacing: -1 }}>
            servd
          </div>
        </div>

        <div
          style={{
            marginTop: 44,
            fontSize: 72,
            fontWeight: 800,
            lineHeight: 1.08,
            letterSpacing: -2,
            color: "#2b1124",
            maxWidth: 900,
            display: "flex",
          }}
        >
          Create your restaurant&apos;s online ordering page — free
        </div>

        <div style={{ marginTop: 28, fontSize: 32, color: "#2b1124", opacity: 0.65, maxWidth: 860, display: "flex" }}>
          Upload your logo and menu, build your preview, and see how your customers order.
        </div>

        <div
          style={{
            marginTop: 40,
            display: "flex",
            alignItems: "center",
            gap: 18,
            fontSize: 26,
            fontWeight: 700,
            color: "#2b1124",
            opacity: 0.5,
          }}
        >
          {/* "PHP" rather than the ₱ sign on purpose: ImageResponse fetches a
              font per glyph at build time, and the peso sign isn't in the
              default set — a build that needs the network to render a currency
              symbol is a build that fails on a bad day. */}
          No credit card • No commitment • PHP 499 one-time to activate
        </div>
      </div>
    ),
    size,
  );
}
