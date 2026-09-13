/**
 * A partner's brand: what their merchants, and their merchants' customers, see
 * instead of CANVEXIA.
 *
 * Stored as JSON on `Partner.brandConfig` rather than as columns, because the
 * set of things a brand carries grows — a support Messenger link, a legal
 * footer, a second logo for dark backgrounds — and each addition would otherwise
 * be a hand-run migration on a live table for a field only the partner portal
 * reads.
 *
 * The cost of JSON is that nothing checks it at the database boundary, so
 * everything here has to: `parseBrandConfig` is the only way this data enters
 * the application, and it discards anything it does not recognise rather than
 * trusting the column.
 *
 * Lives in core because Phase 5's brand engine resolves a request host to one of
 * these and every vertical renders from it. Servd is simply the first.
 */

export interface PartnerBrandConfig {
  /** Shown to merchants and on customer-facing pages. */
  displayName?: string;
  /** For invoices and legal text, where the trading name is not enough. */
  legalName?: string;
  logoUrl?: string;
  /** Optional second logo for dark backgrounds. */
  logoDarkUrl?: string;
  faviconUrl?: string;
  /** Hex, e.g. "#FF8A1E". Feeds the same CSS variables merchant branding does. */
  primaryColor?: string;
  accentColor?: string;
  /** Where a merchant's "get help" goes. Not CANVEXIA. */
  supportEmail?: string;
  supportPhone?: string;
  supportUrl?: string;
  /** Appears under customer-facing pages in full white-label mode. */
  legalFooter?: string;
}

export const EMPTY_BRAND_CONFIG: PartnerBrandConfig = {};

const STRING_FIELDS = [
  "displayName",
  "legalName",
  "logoUrl",
  "logoDarkUrl",
  "faviconUrl",
  "primaryColor",
  "accentColor",
  "supportEmail",
  "supportPhone",
  "supportUrl",
  "legalFooter",
] as const;

const HEX = /^#[0-9a-fA-F]{6}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MAX: Partial<Record<(typeof STRING_FIELDS)[number], number>> = {
  displayName: 80,
  legalName: 120,
  legalFooter: 500,
  supportPhone: 40,
};
const DEFAULT_MAX = 500;

/**
 * Read a brandConfig out of the database column.
 *
 * Never throws and never returns a partial object with junk in it: an unknown
 * key, a number where a string belongs, or the column being null all resolve to
 * "that field is not set". A brand config is decoration — a bad one must not be
 * able to take a storefront down.
 */
export function parseBrandConfig(value: unknown): PartnerBrandConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) return EMPTY_BRAND_CONFIG;
  const raw = value as Record<string, unknown>;
  const out: PartnerBrandConfig = {};
  for (const key of STRING_FIELDS) {
    const v = raw[key];
    if (typeof v === "string" && v.trim() !== "") out[key] = v.trim();
  }
  return out;
}

export type BrandValidation =
  | { ok: true; config: PartnerBrandConfig }
  | { ok: false; errors: string[] };

/**
 * Check a brand config on the way IN, where a person can still fix it.
 *
 * Stricter than parseBrandConfig on purpose. Parsing has to cope with whatever
 * is already stored; saving is a chance to refuse it.
 */
export function validateBrandConfig(input: PartnerBrandConfig): BrandValidation {
  const config = parseBrandConfig(input);
  const errors: string[] = [];

  for (const key of STRING_FIELDS) {
    const v = config[key];
    if (v && v.length > (MAX[key] ?? DEFAULT_MAX)) {
      errors.push(`${key} is too long (max ${MAX[key] ?? DEFAULT_MAX} characters).`);
    }
  }

  for (const key of ["primaryColor", "accentColor"] as const) {
    const v = config[key];
    if (v && !HEX.test(v)) errors.push(`${key} must be a hex colour like #FF8A1E.`);
  }

  for (const key of ["logoUrl", "logoDarkUrl", "faviconUrl", "supportUrl"] as const) {
    const v = config[key];
    // https only. These render inside the merchant's own pages, and an http
    // asset there is a mixed-content warning on somebody else's storefront.
    if (v && !/^https:\/\//i.test(v)) errors.push(`${key} must be a https:// URL.`);
  }

  if (config.supportEmail && !EMAIL.test(config.supportEmail)) {
    errors.push("supportEmail must be a valid email address.");
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, config };
}

/**
 * What a merchant's pages should actually show, given the partner's brand and
 * the platform's own defaults.
 *
 * Explicit rather than a spread so a partner cannot blank out a field by saving
 * an empty string: an unset value falls through to the default, which is what
 * keeps a half-filled brand config from producing a page with no support
 * contact on it.
 */
export function resolveBrand(
  config: PartnerBrandConfig,
  defaults: Required<Pick<PartnerBrandConfig, "displayName" | "primaryColor" | "accentColor">> &
    PartnerBrandConfig,
): PartnerBrandConfig {
  const pick = <K extends keyof PartnerBrandConfig>(key: K) => config[key] ?? defaults[key];
  return {
    displayName: pick("displayName"),
    legalName: pick("legalName"),
    logoUrl: pick("logoUrl"),
    logoDarkUrl: pick("logoDarkUrl"),
    faviconUrl: pick("faviconUrl"),
    primaryColor: pick("primaryColor"),
    accentColor: pick("accentColor"),
    supportEmail: pick("supportEmail"),
    supportPhone: pick("supportPhone"),
    supportUrl: pick("supportUrl"),
    legalFooter: pick("legalFooter"),
  };
}
