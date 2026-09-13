import { NextRequest } from "next/server";
import { rateLimit } from "@/server/build/rate-limit";
import { recordLanding, currentUtm, isLandingEvent } from "@/server/landing/stats";

/**
 * Funnel beacon for the /create landing page. Fired with `sendBeacon`, so it
 * costs the visitor nothing and can't delay the CTA they just tapped.
 *
 * The attribution is read from the server-side cookie, NOT from the request
 * body: this endpoint is public, and a body-supplied campaign name would let
 * anyone write whatever they liked into the founder's ad numbers. The only
 * thing the caller gets to choose is which of two events it is.
 */
export async function POST(req: NextRequest) {
  const limited = await rateLimit("landing:event");
  if (!limited.ok) return new Response(null, { status: 204 });

  let event: unknown;
  try {
    event = (await req.json())?.event;
  } catch {
    return new Response(null, { status: 204 });
  }
  if (!isLandingEvent(event)) return new Response(null, { status: 204 });

  await recordLanding(event, await currentUtm());
  return new Response(null, { status: 204 });
}
