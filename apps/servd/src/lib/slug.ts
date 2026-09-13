/**
 * Slug helpers for restaurant URLs (/order/{slug}/...).
 * `slugify` is pure + testable; `uniqueSlug` adds a numeric suffix on collision.
 */

export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "") // strip accents
      .replace(/[^a-z0-9]+/g, "-") // non-alphanumerics → hyphen
      .replace(/^-+|-+$/g, "") // trim leading/trailing hyphens
      .slice(0, 50)
      .replace(/-+$/g, "") || "restaurant"
  );
}

/**
 * Returns a slug unique against `exists` (a predicate that checks the DB).
 * Tries the base, then base-2, base-3, …
 */
export async function uniqueSlug(
  base: string,
  exists: (slug: string) => Promise<boolean>,
): Promise<string> {
  const root = slugify(base);
  if (!(await exists(root))) return root;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${root}-${n}`;
    if (!(await exists(candidate))) return candidate;
  }
  return `${root}-${Math.random().toString(36).slice(2, 7)}`;
}
