import type { Config } from "tailwindcss";

/**
 * CANVEXIA's palette — deliberately not Servd's.
 *
 * Servd is plum/mango; this is near-black on warm paper with one accent. They
 * share a database and a monorepo and nothing visual: canvexia.com sells the
 * partner programme, servdph.net sells restaurant ordering, and a visitor who
 * cannot tell them apart is a visitor in the wrong place.
 *
 * The coral→ember gradient exists ONCE, in the logo mark. Everywhere else the
 * accent is flat coral. A gradient in the logo and a gradient on every button
 * is the look this brief asked to avoid.
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
      },
      fontFamily: {
        // A grotesque for headlines, matching the wordmark's weight and width.
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      maxWidth: { readable: "68ch" },
    },
  },
};

export default config;
