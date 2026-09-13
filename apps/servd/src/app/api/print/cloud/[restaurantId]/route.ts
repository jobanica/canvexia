import { NextRequest } from "next/server";
import { systemDb } from "@/server/tenancy/scoped-db";
import { parsePrinterConfig, kitchenDestination } from "@/lib/printing/printer-config";

/**
 * Cloud / server-direct print poll endpoint.
 *
 * A CloudPRNT-style printer is configured to poll this URL. We hand it the next
 * queued job as a raw ESC/POS byte stream and mark it printed. This is the
 * device-agnostic transport — it works even from an iPad/iPhone cashier because
 * the printer, not the browser, fetches the job.
 *
 * The printer authenticates with a per-restaurant token stored in
 * `printerConfig.pollToken`. The request is unauthenticated otherwise, so this
 * runs in systemDb but is tightly scoped by restaurantId + token.
 *
 * A restaurant can run TWO printers — the till, and one at the pass for kitchen
 * dockets. They're told apart by the token they poll with: the kitchen printer
 * has its own, and only ever receives jobs stamped for the kitchen. Untagged
 * jobs belong to the till, which is what every job was before a second printer
 * was possible.
 *
 * NOTE: simplified vs the full CloudPRNT handshake (status POST → job GET →
 * confirm) — enough to demonstrate the transport; harden per your printer model.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ restaurantId: string }> },
) {
  const { restaurantId } = await params;
  const token = req.nextUrl.searchParams.get("token");

  const job = await systemDb(async (tx) => {
    const restaurant = await tx.restaurant.findUnique({
      where: { id: restaurantId },
      select: { printerConfig: true },
    });
    const cfg = parsePrinterConfig(restaurant?.printerConfig);
    const kitchen = kitchenDestination(cfg.kitchen);

    // Which printer is asking? The kitchen's token only exists once a second
    // printer is set up, and it must not collide with the till's.
    let station: "till" | "kitchen";
    if (token && kitchen?.method === "cloud" && kitchen.pollToken === token) {
      station = "kitchen";
    } else if (token && cfg.pollToken && cfg.pollToken === token) {
      station = "till";
    } else {
      return "unauthorized" as const;
    }

    // Untagged jobs are the till's. Written that way on purpose: a database
    // without the `station` column still queues work, and it must keep coming
    // out at the till rather than silently going nowhere.
    const forStation =
      station === "kitchen"
        ? { station: "kitchen" }
        : { OR: [{ station: "till" }, { station: null }] };

    let next;
    try {
      next = await tx.printJob.findFirst({
        where: { restaurantId, method: "cloud", status: "queued", ...forStation },
        orderBy: { createdAt: "asc" },
      });
    } catch {
      // `station` not migrated yet — one queue, as before. The kitchen printer
      // would share it, so setting one up needs add-print-job-station.sql.
      next = await tx.printJob.findFirst({
        where: { restaurantId, method: "cloud", status: "queued" },
        orderBy: { createdAt: "asc" },
      });
    }
    if (!next) return null;

    await tx.printJob.update({
      where: { id: next.id },
      data: { status: "printed", printedAt: new Date() },
    });
    return next;
  });

  if (job === "unauthorized") {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!job) {
    // No work — printers treat an empty 200 as "nothing to print".
    return new Response(null, { status: 200 });
  }

  const bytes = Buffer.from(job.payloadBase64, "base64");
  return new Response(bytes, {
    status: 200,
    headers: { "Content-Type": "application/octet-stream" },
  });
}
