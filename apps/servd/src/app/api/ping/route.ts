/** Ultra-light connectivity probe for offline-mode heartbeats. No DB, no auth. */
export const dynamic = "force-dynamic";

export function GET() {
  return new Response("ok", { status: 200, headers: { "Cache-Control": "no-store" } });
}

export function HEAD() {
  return new Response(null, { status: 200, headers: { "Cache-Control": "no-store" } });
}
