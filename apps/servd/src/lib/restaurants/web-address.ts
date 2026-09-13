import { slugify } from "@/lib/slug";

/**
 * Correcting a shop's web address.
 *
 * A slug is chosen once, from whatever the owner typed as their restaurant name
 * at signup, and then it is the address on every table tent in the building and
 * in every link the shop has ever posted. Typos happen at signup more than
 * anywhere else in the product — it's the first thing anybody types, usually on
 * a phone — and until now there was no way to fix one.
 *
 * The rules for what a valid address is, and what changing one costs, live here
 * so they can be stated once and tested rather than half-enforced in a form.
 */

/**
 * Addresses the platform needs for itself, or that would read as something they
 * are not. A shop called "Admin Café" doesn't get `/r/admin`.
 */
export const RESERVED_ADDRESSES = [
  "admin",
  "api",
  "app",
  "auth",
  "build",
  "cashier",
  "claim",
  "create",
  "dashboard",
  "kitchen",
  "login",
  "logout",
  "order",
  "partner",
  "preview",
  "privacy",
  "r",
  "sites",
  "super-admin",
  "support",
  "terms",
  "tutorials",
  "www",
];

export const ADDRESS_MIN = 3;
export const ADDRESS_MAX = 50;

export type AddressCheck =
  | { ok: true; slug: string }
  | { ok: false; error: string };

/**
 * Clean up what was typed and say whether it can be used.
 *
 * Runs what was typed through the SAME slugify the platform used to mint the
 * address in the first place, so what the owner previews here is exactly what
 * they will get. Typing "Mango Grill" and typing "mango-grill" reach the same
 * place, which is what somebody correcting a typo expects.
 */
export function checkWebAddress(raw: unknown, current?: string): AddressCheck {
  const typed = typeof raw === "string" ? raw.trim() : "";
  if (!typed) return { ok: false, error: "Type the address you want." };

  const slug = slugify(typed);

  if (slug.length < ADDRESS_MIN) {
    return { ok: false, error: `Too short — use at least ${ADDRESS_MIN} letters or numbers.` };
  }
  if (slug.length > ADDRESS_MAX) {
    return { ok: false, error: `Too long — keep it under ${ADDRESS_MAX} characters.` };
  }
  // slugify falls back to this when it's handed something with no usable
  // characters at all, so seeing it back means nothing the owner typed survived.
  if (slug === "restaurant" && slugify(typed) !== typed.toLowerCase()) {
    return { ok: false, error: "Use letters and numbers — that didn't leave anything to use." };
  }
  if (RESERVED_ADDRESSES.includes(slug)) {
    return { ok: false, error: `"${slug}" is reserved by Servd. Try something else.` };
  }
  if (current && slug === current) {
    return { ok: false, error: "That's already your address." };
  }
  return { ok: true, slug };
}

/**
 * What a shop's public links look like at a given address — so the form can
 * show the owner the real thing before they commit to it.
 */
export function webAddressPreview(appUrl: string, slug: string): { site: string; table: string } {
  const base = appUrl.replace(/\/$/, "");
  return {
    site: `${base}/r/${slug}`,
    table: `${base}/order/${slug}/…`,
  };
}
