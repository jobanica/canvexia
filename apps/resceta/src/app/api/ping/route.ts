export const dynamic = "force-dynamic";

/**
 * Is the server actually reachable?
 *
 * 204 and nothing else. It exists so the counter can CONFIRM a connection
 * rather than take `navigator.onLine`'s word for it — see `useOnline`. The
 * service worker passes everything that is not a navigation or a static asset
 * straight through, so this really does test the network rather than a cache.
 */
export async function GET() {
  return new Response(null, {
    status: 204,
    headers: {
      // Belt and braces: a cached 204 would make an offline till look online.
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
