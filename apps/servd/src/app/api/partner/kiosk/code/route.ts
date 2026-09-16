import { NextRequest } from "next/server";
import { requireWritablePartner } from "@/server/partners/auth";
import { currentCode } from "@/server/partners/kiosk";
import { partnerUrl } from "@/lib/urls";

/**
 * The code a kiosk screen is displaying right now.
 *
 * POLLED, rather than pushed or computed in the browser. Computing it client
 * side would mean sending the kiosk's secret to a tablet that sits unattended
 * on a counter all day — and anybody who lifts that secret can mint valid
 * clock-in codes from anywhere. So the tablet is a display: it asks, it draws,
 * it never holds the key.
 *
 * Gated by the same session as the kiosk page. A kiosk is opened by a manager
 * who then leaves the tablet on the counter, so the session is what is standing
 * behind it.
 *
 * `no-store`, because a cached code is a code that is no longer true.
 */
export async function GET(req: NextRequest) {
  const who = await requireWritablePartner("attendance.view_all");
  if (!who) return new Response("Unauthorized", { status: 401 });

  const kioskId = req.nextUrl.searchParams.get("id") ?? "";
  const current = await currentCode(who.partnerId, kioskId);
  if (!current) {
    // Also what a deactivated kiosk returns, which is how switching one off
    // takes effect on the screen without anybody touching the tablet.
    return Response.json({ ok: false }, { headers: { "Cache-Control": "no-store" } });
  }

  return Response.json(
    {
      ok: true,
      code: current.code,
      label: current.label,
      // The scan target, composed here so the display never has to know the
      // URL shape. The phone's own camera app opens this directly.
      // The PORTAL host: a phone camera opens this, and the staff app lives on
      // the partner domain.
      url: `${partnerUrl()}/partner/attendance?kiosk=${encodeURIComponent(
        kioskId,
      )}&code=${encodeURIComponent(current.code)}`,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
