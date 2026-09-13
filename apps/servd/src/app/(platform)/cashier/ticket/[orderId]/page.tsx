import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/server/tenancy/current-user";
import { getOrderTicket } from "@/server/printing/ticket-query";
import { ticketLines } from "@/lib/printing/ticket";
import { qrSvg } from "@/lib/qr";
import { AutoPrint } from "@/components/cashier/AutoPrint";

/**
 * Printable HTML ticket for the OS-dialog / AirPrint transport. Rendered in a
 * narrow, monospace, receipt-like layout and auto-opens the print dialog.
 */
export default async function TicketPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ doc?: string }>;
}) {
  const { orderId } = await params;
  const { doc } = await searchParams;
  const user = await getCurrentUser();
  if (!user || user.kind !== "staff" || !["cashier", "admin"].includes(user.role)) {
    redirect("/login");
  }

  const kind = doc === "bill" ? "bill" : doc === "kitchen" ? "kitchen" : "receipt";
  const ticket = await getOrderTicket(user.restaurantId, orderId, kind);
  if (!ticket) notFound();

  const qr = ticket.qrUrl ? await qrSvg(ticket.qrUrl) : null;

  return (
    <div className="mx-auto max-w-[300px] bg-white p-4 font-mono text-sm text-black">
      <AutoPrint />
      <pre className="whitespace-pre-wrap leading-snug">
        {ticketLines(ticket).join("\n")}
      </pre>
      {qr && (
        <div className="mt-3 flex flex-col items-center">
          <p className="mb-1 text-xs">Scan to order online</p>
          <div className="w-[160px]" dangerouslySetInnerHTML={{ __html: qr }} />
        </div>
      )}
    </div>
  );
}
