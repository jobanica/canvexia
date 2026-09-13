/**
 * Social platforms the content scheduler exposes. Pure data so both the
 * composer (client) and the Upload-Post client (server) can use it.
 * Upload-Post supports more; these are the ones relevant to restaurants.
 */
export const SOCIAL_PLATFORMS = [
  { key: "facebook", label: "Facebook" },
  { key: "instagram", label: "Instagram" },
  { key: "tiktok", label: "TikTok" },
  { key: "threads", label: "Threads" },
  { key: "x", label: "X (Twitter)" },
  { key: "linkedin", label: "LinkedIn" },
] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number]["key"];

const VALID = new Set<string>(SOCIAL_PLATFORMS.map((p) => p.key));

/** Drop unknown/duplicate platform keys. */
export function sanitizePlatforms(list: readonly string[]): SocialPlatform[] {
  return [...new Set(list.filter((p): p is SocialPlatform => VALID.has(p)))];
}

/** "facebook,instagram" → readable labels. */
export function platformLabels(csv: string): string {
  return csv
    .split(",")
    .map((k) => SOCIAL_PLATFORMS.find((p) => p.key === k)?.label ?? k)
    .filter(Boolean)
    .join(", ");
}
