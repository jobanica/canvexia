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

/**
 * The same hue, dark enough to read.
 *
 * A partner's primary colour is used two ways in a portal: as TEXT on white
 * (links, figures, the active nav row) and as a SOLID with white text on it
 * (the primary button). Both fail in the same direction — too light — so one
 * adjustment fixes both: darken until the colour clears `min` against white,
 * and a pale yellow becomes a dark gold rather than an invisible button.
 *
 * KEEPS THE HUE. It scales the channels rather than blending toward black, so
 * what comes back is recognisably the colour that was chosen. A partner who
 * picks #FFE14D gets a deeper version of their yellow, not a grey.
 *
 * Returns the input untouched when it already passes, and null when it is not
 * a hex this understands — the caller then falls back to its own default
 * rather than rendering a broken variable.
 *
 * NOT a substitute for telling them. The brand editor shows the ratio and says
 * when this will kick in; silently changing somebody's brand colour and never
 * mentioning it is how you get a bug report about a colour that "won't save".
 */
export function darkenToContrast(color: string, min = 4.5): string | null {
  // Against WHITE, fixed. Darkening only ever helps against a light background;
  // taking a `background` parameter would invite passing a dark one, where this
  // loop converges on black and makes the problem worse.
  const against = "#FFFFFF";
  const rgb = parseHex(color);
  if (!rgb) return null;

  const hex = (c: [number, number, number]) =>
    "#" + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");

  const current = contrast(hex(rgb), against);
  if (!current) return null;
  if (current.ratio >= min) return hex(rgb);

  // Bisect on a scale factor rather than stepping: 24 halvings settle well
  // inside one 8-bit step, and a loop that steps by 1% can run 100 times and
  // still overshoot.
  let lo = 0; // black — always passes against white
  let hi = 1; // the colour as chosen — does not
  for (let i = 0; i < 24; i += 1) {
    const mid = (lo + hi) / 2;
    const test = hex([rgb[0] * mid, rgb[1] * mid, rgb[2] * mid]);
    const r = contrast(test, against);
    if (r && r.ratio >= min) lo = mid;
    else hi = mid;
  }
  // `lo` is the lightest factor that still passes. Guard the degenerate case
  // where even the first step down did not: bisection converging on 0 means
  // black, which passes by definition.
  return hex([rgb[0] * lo, rgb[1] * lo, rgb[2] * lo]);
}
