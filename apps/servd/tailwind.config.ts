import type { Config } from "tailwindcss";

/**
 * Tailwind is wired to CSS variables instead of hard-coded hex values.
 *
 * WHY: the platform (Servd) and each restaurant (white-label) share the same
 * components but need different colors. We define the Servd palette as the
 * DEFAULT values of these variables in globals.css, and on diner-facing pages
 * we override `--brand-*` at runtime with the restaurant's own colors.
 * Same Tailwind classes, different brand — no conditional styling needed.
 */
/**
 * A CSS-variable colour that still honours Tailwind's `/opacity` suffix.
 *
 * color-mix keeps the variable indirection — so a restaurant's own colour,
 * injected at runtime by BrandProvider, still flows through — while giving the
 * alpha somewhere to land. Without the opacity suffix it resolves to the plain
 * variable, exactly as before.
 */
function brandColor(cssVar: string) {
  return ({ opacityValue }: { opacityValue?: string }) => {
    // Tailwind passes a NUMBER for `/20`, but for a plain `bg-brand-primary` it
    // passes the string "var(--tw-bg-opacity)" — not undefined. Coercing that
    // yields NaN and a colour the browser throws away, which would have broken
    // every solid brand button to fix the translucent ones.
    const alpha = Number(opacityValue);
    if (opacityValue === undefined || !Number.isFinite(alpha)) return `var(${cssVar})`;
    return `color-mix(in srgb, var(${cssVar}) ${alpha * 100}%, transparent)`;
  };
}

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Servd platform palette (fixed)
        mango: "#FF8A1E",
        guava: "#FF4D6D",
        "plum-ink": "#2B1124",
        cream: "#FFF6EC",
        muted: "#A9959F",
        // Brand-aware tokens (overridable per restaurant via CSS vars).
        //
        // Wrapped in brandColor() rather than written as a bare var(), because
        // a bare var() silently breaks every opacity modifier: Tailwind has no
        // channels to inject an alpha into, so `bg-brand-primary/10` compiled
        // to an invalid colour and rendered FULLY TRANSPARENT. 165 of those
        // across the app — every tinted card and soft border was simply not
        // there, and nothing errored to say so.
        // The cast is needed because Tailwind's TS types model colours as
        // strings, while the runtime has always accepted this function form.
        brand: {
          primary: brandColor("--brand-primary"),
          accent: brandColor("--brand-accent"),
          ink: brandColor("--brand-ink"),
          surface: brandColor("--brand-surface"),
        } as unknown as Record<string, string>,
      },
      backgroundImage: {
        // The Servd signature gradient. Use sparingly (icon tile, primary CTA).
        "brand-gradient": "var(--brand-gradient)",
      },
      fontFamily: {
        // Outfit = wordmark/headings, Inter = UI/body. Loaded via next/font.
        heading: ["var(--font-outfit)", "system-ui", "sans-serif"],
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        tile: "1.5rem",
      },
    },
  },
  plugins: [],
};

export default config;
