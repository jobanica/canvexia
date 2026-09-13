import type { Metadata } from "next";

/**
 * Link-preview (Open Graph / Twitter) metadata for a restaurant's public
 * ordering site. When a customer shares their store link on Messenger,
 * Facebook, Viber, etc., this makes THEIR name + logo/cover show up — not the
 * Servd default. Prefers the wide cover image (best for a share banner) and
 * falls back to the logo; the logo also becomes the browser-tab icon.
 */
export function storefrontMetadata(r: {
  name: string;
  tagline?: string | null;
  logoUrl?: string | null;
  coverImageUrl?: string | null;
}): Metadata {
  const title = `${r.name} — Order online`;
  const description = r.tagline || `Order online from ${r.name}.`;
  const image = r.coverImageUrl || r.logoUrl || undefined;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      siteName: r.name,
      type: "website",
      images: image ? [{ url: image }] : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images: image ? [image] : undefined,
    },
    icons: r.logoUrl ? { icon: r.logoUrl } : undefined,
  };
}
