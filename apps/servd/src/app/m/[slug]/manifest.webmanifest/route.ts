import { NextResponse } from "next/server";
import { systemDb } from "@/server/tenancy/scoped-db";
import { merchantManifest } from "@/lib/merchant-app";

export const dynamic = "force-dynamic";

/**
 * One restaurant's dashboard manifest.
 *
 * KEYED BY SLUG, NOT BY SESSION, and that is forced rather than chosen: a
 * browser fetches a manifest WITHOUT credentials unless the link carries
 * `crossorigin="use-credentials"`, which Next's `metadata.manifest` does not
 * set. The slug is the storefront subdomain and already public, so nothing here
 * is a leak — it returns a shop's public name and brand colour, which any
 * diner can read off the storefront.
 *
 * Middleware never sees this request: its matcher excludes any path containing
 * a dot, so no host rewrite applies and the path is the same on every domain.
 *
 * An unknown slug 404s rather than falling back to a generic manifest. A
 * manifest that always answers would let a typo install an app pointing at
 * somebody else's dashboard.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;

  const restaurant = await systemDb((tx) =>
    tx.restaurant.findUnique({
      where: { slug },
      select: { name: true, displayName: true, slug: true, brandPrimaryColor: true },
    }),
  ).catch(() => null);
  if (!restaurant) return new NextResponse("Not found", { status: 404 });

  return NextResponse.json(
    merchantManifest({
      name: restaurant.displayName || restaurant.name,
      slug: restaurant.slug,
      primaryColor: restaurant.brandPrimaryColor,
    }),
    {
      headers: {
        "content-type": "application/manifest+json; charset=utf-8",
        // A shop renaming itself should reach the home screen in minutes, not
        // after a reinstall — and a manifest is re-fetched rarely enough that
        // five minutes costs nothing.
        "cache-control": "public, max-age=300",
      },
    },
  );
}
