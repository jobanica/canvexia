import { NextResponse } from "next/server";
import { systemDb } from "@/server/tenancy/scoped-db";
import { normaliseHost } from "@/lib/partners/custom-host";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * IS THIS HOST A PARTNER'S PORTAL?
 *
 * REPORTED — a partner added www.myrestoph.asia, the record said "active", the
 * DNS was right, the certificate was valid, and the address served a 404.
 *
 * Everything up to the app was working. `parseHost` is pure and Edge-safe by
 * design — it routes by the SHAPE of a hostname — so a partner subdomain of
 * canvexia.com resolves as a portal and a domain nobody could have predicted
 * resolves as `custom`, which means "a restaurant's storefront". The middleware
 * rewrote it to /sites/www.myrestoph.asia, no restaurant had that host, and the
 * 404 was the honest end of a lookup that was asking the wrong question.
 *
 * Shape cannot answer this one. Only the database knows which arbitrary domain
 * belongs to which partner, so the middleware asks — through here, because the
 * Edge runtime has no Prisma.
 *
 * IT RETURNS AS LITTLE AS POSSIBLE: whether the host serves a portal, and the
 * spelling the partner registered. No id, no name, no slug. All of it is
 * already discoverable by visiting the address once routing works, but a
 * dictionary of every partner domain on the platform is not, and this endpoint
 * is unauthenticated because the middleware calling it has no session to
 * present.
 *
 * WWW AND APEX BOTH ANSWER, with `canonical` naming the one that was
 * registered, so the middleware can redirect the other to it rather than
 * serving a portal at two addresses and splitting every cookie.
 */
export async function GET(req: Request) {
  const asked = normaliseHost(new URL(req.url).searchParams.get("host") ?? "");
  if (!asked) return NextResponse.json({ partner: false });

  // The pair, so a partner who registered one spelling is reachable at both.
  const counterpart = asked.startsWith("www.") ? asked.slice(4) : `www.${asked}`;

  const row = await systemDb((tx) =>
    tx.partner.findFirst({
      where: {
        customDomain: { in: [asked, counterpart] },
        // A suspended operator's domain stops serving. It is the one lever that
        // actually takes their portal off the internet.
        status: "approved",
      },
      select: { customDomain: true },
    }),
  ).catch(() => null);

  if (!row?.customDomain) return NextResponse.json({ partner: false });
  return NextResponse.json({ partner: true, canonical: row.customDomain });
}
