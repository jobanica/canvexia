/**
 * WHITE-LABEL THEMING
 *
 * The Servd platform palette is the DEFAULT. A brand-new restaurant that hasn't
 * customized anything inherits these, so it looks clean out of the box. Once a
 * restaurant sets its own colors/logo, those override the defaults on every
 * diner-facing page — without changing a single component, because components
 * style themselves from the `--brand-*` CSS variables.
 */

export const SERVD_DEFAULTS = {
  primary: "#FF7A1A",
  accent: "#FF4D6D",
  ink: "#2B1124",
  surface: "#FFF6EC",
  gradient: "linear-gradient(135deg, #FF9A2E 0%, #FF7A1A 52%, #FF4D6D 100%)",
} as const;

/** The subset of a Restaurant record relevant to theming. */
export interface BrandInput {
  brandPrimaryColor?: string | null;
  brandAccentColor?: string | null;
}

/**
 * Builds the inline CSS-variable style object for a restaurant. Falls back to
 * Servd defaults for anything the restaurant hasn't set. We derive the gradient
 * from the restaurant's primary→accent so even a single chosen color produces a
 * coherent brand.
 */
export function brandStyle(brand: BrandInput): React.CSSProperties {
  const primary = brand.brandPrimaryColor || SERVD_DEFAULTS.primary;
  const accent = brand.brandAccentColor || SERVD_DEFAULTS.accent;
  const gradient = `linear-gradient(135deg, ${primary} 0%, ${accent} 100%)`;

  return {
    // cast because CSS custom properties aren't in React's CSSProperties type
    ["--brand-primary" as string]: primary,
    ["--brand-accent" as string]: accent,
    ["--brand-gradient" as string]: gradient,
    ["--brand-ink" as string]: SERVD_DEFAULTS.ink,
    ["--brand-surface" as string]: SERVD_DEFAULTS.surface,
  } as React.CSSProperties;
}
