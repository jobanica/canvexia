/**
 * WCAG contrast, for the brand editor.
 *
 * A partner picking their own colours will eventually pick a pale yellow for a
 * button with white text on it, and the first person to notice will be one of
 * their merchants, on a phone, in sunlight. This is the check that says so
 * before it ships.
 *
 * Pure, and in core because the same colours feed every product's CSS
 * variables — the check belongs with the definition, not with one editor.
 */
export interface ContrastResult {
  /** 1–21. */
  ratio: number;
  /** 4.5:1 — normal body text. */
  passesAA: boolean;
  /** 3:1 — text at 18pt+/14pt bold, and UI component boundaries. */
  passesAALarge: boolean;
}

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** sRGB relative luminance, per WCAG 2.x. */
function luminance([r, g, b]: [number, number, number]): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Null when either colour is not a hex this understands. */
export function contrast(a: string, b: string): ContrastResult | null {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return null;
  const la = luminance(ca);
  const lb = luminance(cb);
  const ratio = (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  return {
    // Two decimals: the number is shown to a person choosing a colour, and
    // 4.4999 rounding to "4.5 ✓" would be a failing button labelled passing.
    ratio: Math.floor(ratio * 100) / 100,
    passesAA: ratio >= 4.5,
    passesAALarge: ratio >= 3,
  };
}

/** Whether white or near-black text sits better on a colour. */
export function readableOn(background: string): "#FFFFFF" | "#1A1A1E" {
  const white = contrast(background, "#FFFFFF");
  const ink = contrast(background, "#1A1A1E");
  if (!white || !ink) return "#1A1A1E";
  return white.ratio >= ink.ratio ? "#FFFFFF" : "#1A1A1E";
}
