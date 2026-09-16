import { headers } from "next/headers";
import { manifestResponse } from "@/lib/partners/manifest";

/**
 * The partner portal's manifest. Built per host — see lib/partners/manifest.ts
 * for why this is a route and not a file in public/.
 *
 * A file in public/ would SHADOW this route, so `public/partner.webmanifest`
 * must not come back.
 *
 * Middleware never sees this request: its matcher excludes any path containing
 * a dot, so the `/partner` prefix is not applied here and the path is the same
 * on every host.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  return manifestResponse("portal", (await headers()).get("host"));
}
