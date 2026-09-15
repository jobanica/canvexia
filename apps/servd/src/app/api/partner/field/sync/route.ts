import {
  checkInAction,
  checkOutAction,
  logVisitAction,
} from "@/server/partners/attendance-actions";

/**
 * The offline queue's drain target.
 *
 * A ROUTE rather than a server action invoked directly, because a server
 * action's id is a build artefact: an item queued on a phone yesterday must
 * still be sendable after today's deploy, and a URL is stable in a way an
 * action id is not.
 *
 * It does no authorisation of its own and deliberately so — it hands the form
 * straight to the same actions the online path uses, and those hold the gate.
 * A second copy of "may this seat check in" here is a second copy to get wrong.
 *
 * ALWAYS 200 ON A REFUSAL THE SERVER MEANT. The queue treats a non-2xx as "try
 * again later", so returning 403 for a deactivated seat would make a phone
 * retry the same rejected visit until the battery died. The body says what
 * happened; only an actual server fault is a 5xx.
 */
export async function POST(req: Request) {
  const form = await req.formData();
  const kind = String(form.get("kind") ?? "");

  try {
    const result =
      kind === "check_in"
        ? await checkInAction(null, form)
        : kind === "check_out"
          ? await checkOutAction(null, form)
          : kind === "visit"
            ? await logVisitAction(null, form)
            : { error: "Unknown item." };

    return Response.json({ ok: !!result?.ok, error: result?.error ?? null });
  } catch {
    // A real fault. 503 so the queue keeps the item and tries again.
    return new Response(JSON.stringify({ ok: false, error: "Sync failed." }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}
