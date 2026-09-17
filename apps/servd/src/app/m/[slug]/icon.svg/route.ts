import { NextResponse } from "next/server";
import { systemDb } from "@/server/tenancy/scoped-db";
import { monogramSvg } from "@/lib/merchant-app";

export const dynamic = "force-dynamic";

/**
 * The shop's tile: its initial on its own brand colour.
 *
 * Same reasoning as the manifest beside it — keyed by the public slug, because
 * a manifest's icons are fetched without credentials too.
 *
 * WHY NOT THEIR UPLOADED LOGO. It is an arbitrary aspect ratio at an unknown
 * size. A manifest icon entry has to declare its dimensions, and declaring
 * invented ones produces a stretched tile on somebody's home screen; there is
 * no rasteriser in this deployment to square and pad it. A letter on a coloured
 * square is exact, legible at 48px, and — unlike one shared orange tile —
 * different for every shop.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;

  const restaurant = await systemDb((tx) =>
    tx.restaurant.findUnique({
      where: { slug },
      select: { name: true, displayName: true, brandPrimaryColor: true },
    }),
  ).catch(() => null);
  if (!restaurant) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(
    monogramSvg(restaurant.displayName || restaurant.name, restaurant.brandPrimaryColor),
    {
      headers: {
        "content-type": "image/svg+xml; charset=utf-8",
        "cache-control": "public, max-age=300",
      },
    },
  );
}
