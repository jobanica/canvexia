/**
 * Dietary & allergen tags for menu items. Stored on MenuItem.dietaryTags as an
 * array of these keys. "diet" tags are positive preferences a diner can filter
 * by; "allergen" tags are warnings shown as badges. Shared by admin + diner.
 */
export type TagKind = "diet" | "allergen";

export interface DietaryTag {
  key: string;
  label: string;
  emoji: string;
  kind: TagKind;
}

export const DIETARY_TAGS: readonly DietaryTag[] = [
  { key: "vegetarian", label: "Vegetarian", emoji: "🥗", kind: "diet" },
  { key: "vegan", label: "Vegan", emoji: "🌱", kind: "diet" },
  { key: "halal", label: "Halal", emoji: "☪️", kind: "diet" },
  { key: "gluten_free", label: "Gluten-free", emoji: "🌾", kind: "diet" },
  { key: "spicy", label: "Spicy", emoji: "🌶️", kind: "diet" },
  { key: "contains_nuts", label: "Contains nuts", emoji: "🥜", kind: "allergen" },
  { key: "contains_shellfish", label: "Contains shellfish", emoji: "🦐", kind: "allergen" },
  { key: "contains_dairy", label: "Contains dairy", emoji: "🥛", kind: "allergen" },
  { key: "contains_egg", label: "Contains egg", emoji: "🥚", kind: "allergen" },
  { key: "contains_soy", label: "Contains soy", emoji: "🫘", kind: "allergen" },
] as const;

const BY_KEY = new Map(DIETARY_TAGS.map((t) => [t.key, t]));

export function tagInfo(key: string): DietaryTag | undefined {
  return BY_KEY.get(key);
}

export const DIET_KEYS = DIETARY_TAGS.filter((t) => t.kind === "diet").map((t) => t.key);
export const ALLERGEN_KEYS = DIETARY_TAGS.filter((t) => t.kind === "allergen").map((t) => t.key);

/** Keep only known tag keys (sanitises untrusted input). */
export function sanitizeTags(keys: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of keys) {
    if (BY_KEY.has(k) && !seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}
