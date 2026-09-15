import type { Config } from "tailwindcss";

/**
 * CANVEXIA's palette, extended for a darker layout.
 *
 * The identity is still the logo's: near-black ink, warm paper, a coral→ember
 * accent. What this adds is the deep surface the new layout needs — the hero
 * blob, the four-column band, the footer — and a tint scale for icon tiles.
 *
 * `midnight` is ink pushed toward blue and brightened just enough to sit under
 * white text at AA. Pure #1A1A1E across a full-bleed band reads as a printing
 * error rather than a colour; this reads as deliberate and still belongs to the
 * same family.
 *
 * NOTE ON THE GRADIENT. Earlier this file said the coral→ember gradient exists
 * once, in the logo. That rule came from the original brief's "not a US startup
 * clone". The reference design this page was later asked to follow is
 * gradient-forward, so the gradient is now an accent system: the primary
 * button, the icon tiles and the CTA bar. It is still the ONLY gradient — no
 * second hue enters anywhere.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1A1A1E",
        "ink-soft": "#54545C",
        "ink-faint": "#8A8A93",
        paper: "#FAFAF8",
        line: "#E5E4E0",
        coral: "#E8536A",
        ember: "#F2894E",
        // The deep surface family.
        midnight: "#14141C",
        "midnight-soft": "#1E1E29",
        "midnight-line": "#2E2E3C",
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      maxWidth: { readable: "68ch" },
      borderRadius: { card: "1.25rem", pill: "999px" },
      boxShadow: {
        card: "0 1px 0 rgba(26,26,30,0.04), 0 18px 40px -28px rgba(26,26,30,0.45)",
        lift: "0 1px 0 rgba(26,26,30,0.04), 0 26px 60px -30px rgba(26,26,30,0.55)",
        glow: "0 18px 50px -20px rgba(232,83,106,0.45)",
      },
    },
  },
};

export default config;
