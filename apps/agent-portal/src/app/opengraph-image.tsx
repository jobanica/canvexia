import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { AGENT_OFFER } from "@/lib/agentOffer";
import { pesoWhole } from "@/lib/money";

/**
 * The picture Facebook and Messenger show when someone shares the link.
 *
 * Drawn here rather than shipped as a file: it is generated once at build time
 * and served as a static asset, and the numbers come from the same offer
 * config as the page, so a share preview can never quote a stale commission.
 *
 * The font is committed alongside it — see `og/README.md`. Left to itself
 * `next/og` fetches one from Google Fonts for any character it cannot draw,
 * which turned ₱ into an empty box here.
 */
export const alt = "Maging Canvexia Agent — kumita buwan-buwan sa bawat referral";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const font = readFileSync(join(process.cwd(), "src/app/og/dejavu-sans-bold-subset.ttf"));

export default function Image() {
  const figure = (amount: number, label: string) => (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <span style={{ fontSize: 64, lineHeight: 1.1 }}>{pesoWhole(amount)}</span>
      <span style={{ fontSize: 28, opacity: 0.8 }}>{label}</span>
    </div>
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "linear-gradient(135deg, #7c5cf5 0%, #4a3aa3 100%)",
          color: "white",
          fontFamily: "DejaVu",
        }}
      >
        <div style={{ display: "flex", fontSize: 28, letterSpacing: 2, opacity: 0.85 }}>
          CANVEXIA AGENT PROGRAM
        </div>

        <div style={{ display: "flex", fontSize: 56, lineHeight: 1.15, maxWidth: 1010 }}>
          Kumita buwan-buwan sa bawat negosyong ma-refer mo.
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", gap: 56 }}>
          {figure(AGENT_OFFER.activationCommission, "sa activation")}
          {figure(AGENT_OFFER.tier1Amount, "kada buwan")}
          <span style={{ fontSize: 24, opacity: 0.8, paddingBottom: 8, whiteSpace: "nowrap" }}>
            Libre mag-apply. Walang puhunan.
          </span>
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: "DejaVu", data: font, style: "normal", weight: 700 }] },
  );
}
