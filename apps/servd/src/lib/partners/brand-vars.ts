import { contrast, darkenToContrast } from "@servd/core";

/**
 * A PARTNER'S PORTAL IN A PARTNER'S COLOURS.
 *
 * REPORTED — "already changed the color branding, but the color of my dashboard
 * did not change." It never could. Every partner route is wrapped in
 * `.brand-canvexia`, which pins `--brand-primary` and `--brand-accent` to
 * CANVEXIA's own palette, and nothing anywhere read the `brandConfig` those two
 * colour pickers write. The brand editor saved, said "Saved", and changed
 * nothing a partner could see.
 *
 * These are the SAME TWO VARIABLES `.brand-canvexia` sets, written inline on
 * the same element, so they win by specificity and every `brand-*` Tailwind
 * class, every tinted border and every badge follows without a component
 * knowing anything about it.
 *
 * ONLY TWO. `--brand-ink` and `--brand-surface` stay CANVEXIA's, because the
 * editor never offers them: a partner cannot choose a background, so inventing
 * one from their primary would be this system deciding what their brand is.
 * `--brand-gradient` stays flat ink for the reason it was made flat — the
 * gradient belongs to the logo and nowhere else.
 *
 * DARKENED WHEN IT HAS TO BE. The primary is used as text on white and as a
 * solid under white text; both fail when it is too light. `darkenToContrast`
 * keeps the hue and takes it down to 4.5:1 — so a partner who picks a pale
 * yellow gets a deep gold, not an invisible button. The editor shows the ratio
 * and says when this applies, because a colour that silently changes is a bug
 * report waiting to happen.
 *
 * The ACCENT is not darkened. It is used for tints and small marks rather than
 * for text, and dragging it toward the primary would collapse the two colours a
 * partner deliberately chose to be different.
 */
export function partnerBrandVars(brand: {
  primaryColor: string | null;
  accentColor: string | null;
}): React.CSSProperties {
  const vars: Record<string, string> = {};

  if (brand.primaryColor) {
    // Null when the stored value is not a hex — then nothing is written and
    // CANVEXIA's own primary stands, which is a working screen rather than a
    // variable set to garbage.
    const readable = darkenToContrast(brand.primaryColor);
    if (readable) vars["--brand-primary"] = readable;
  }
  // Validated, not adjusted: `contrast` returns null for anything that is not
  // a hex, which is the only check this one needs.
  if (brand.accentColor && contrast(brand.accentColor, "#FFFFFF")) {
    vars["--brand-accent"] = brand.accentColor;
  }

  return vars as React.CSSProperties;
}
