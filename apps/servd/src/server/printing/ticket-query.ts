import { tenantDb } from "@/server/tenancy/scoped-db";
import type { OrderTypeKey } from "@/lib/orders/order-type";
import { buildTicket, type Ticket, type TicketKind } from "@/lib/printing/ticket";
import { parsePrinterConfig } from "@/lib/printing/printer-config";
import { restaurantSiteUrl } from "@/lib/qr";
import { formatOrderNumber } from "@/lib/orders/order-number";

/** Loads an order and shapes it into a Ticket (tenant-scoped). */
export async function getOrderTicket(
  restaurantId: string,
  orderId: string,
  kind: TicketKind = "receipt",
): Promise<Ticket | null> {
  return tenantDb(restaurantId, async (tx) => {
    const restaurant = await tx.restaurant.findFirstOrThrow({
      select: { name: true, displayName: true, slug: true, printerConfig: true },
    });
    const cfg = parsePrinterConfig(restaurant.printerConfig);
    const receipt = cfg.receipt;
    const order = await tx.order.findFirst({
      where: { id: orderId },
      // Explicit select (no SELECT *) so a lagging schema can't break printing.
      select: {
        id: true,
        total: true,
        createdAt: true,
        table: { select: { tableNumber: true } },
        // orderType / customer columns may lag — read separately below.
        items: {
          select: {
            quantity: true,
            nameAtTime: true,
            note: true,
            unitPrice: true,
            modifiers: { select: { nameAtTime: true, priceDeltaAtTime: true } },
          },
        },
      },
    });
    if (!order) return null;

    // Latest settled payment → shown as the tendered line on the receipt.
    let paymentMethod: string | null = null;
    let paymentAmount: number | null = null;
    try {
      const pay = await tx.payment.findFirst({
        where: { orderId, status: "paid" },
        orderBy: { createdAt: "desc" },
        select: { method: true, amount: true },
      });
      if (pay) {
        paymentMethod = pay.method;
        paymentAmount = pay.amount;
      }
    } catch {
      /* no payment yet */
    }

    // Discount + order-type columns may not exist on a lagging DB — best-effort.
    let discountAmount = 0;
    let discountLabel: string | null = null;
    let orderType: OrderTypeKey = "dine_in";
    let customerName: string | null = null;
    let customerAddress: string | null = null;
    let customerPhone: string | null = null;
    let customerNote: string | null = null;
    let cashTendered: number | null = null;
    let scheduledFor: string | null = null;
    let ticketNumber: string | null = null;
    let surchargeAmount = 0;
    let surchargeLabel: string | null = null;
    try {
      const disc = await tx.order.findFirst({
        where: { id: orderId },
        select: { discountAmount: true, discountLabel: true },
      });
      discountAmount = disc?.discountAmount ?? 0;
      discountLabel = disc?.discountLabel ?? null;
    } catch {
      /* not migrated yet */
    }
    try {
      const meta = await tx.order.findFirst({
        where: { id: orderId },
        select: {
          orderType: true,
          customerName: true,
          customerAddress: true,
          customerPhone: true,
          customerNote: true,
          cashTendered: true,
          scheduledFor: true,
          orderNumber: true,
        },
      });
      orderType = (meta?.orderType ?? "dine_in") as typeof orderType;
      customerName = meta?.customerName ?? null;
      customerAddress = meta?.customerAddress ?? null;
      customerPhone = meta?.customerPhone ?? null;
      customerNote = meta?.customerNote ?? null;
      cashTendered = meta?.cashTendered ?? null;
      scheduledFor = meta?.scheduledFor ? meta.scheduledFor.toISOString() : null;
      // A counter ticket, or a dine-in order taken before anyone sat down.
      // It's what the customer gets called by, so it's what goes on the paper.
      if (meta?.orderNumber != null) ticketNumber = formatOrderNumber(meta.orderNumber);
    } catch {
      /* not migrated yet */
    }

    // The card fee, read on its own so the whole receipt doesn't disappear on a
    // database that hasn't run add-pos-only-and-surcharge.sql. No column means
    // no surcharge was ever charged, which prints exactly right.
    try {
      const s = await tx.order.findFirst({
        where: { id: orderId },
        select: { surchargeAmount: true, surchargeLabel: true },
      });
      surchargeAmount = s?.surchargeAmount ?? 0;
      surchargeLabel = s?.surchargeLabel ?? null;
    } catch {
      /* not migrated yet */
    }

    return buildTicket({
      kind,
      restaurantName: restaurant.displayName || restaurant.name,
      address: receipt.address,
      phone: receipt.phone,
      website: receipt.website,
      footer: receipt.footer,
      showVat: receipt.showVat,
      showCustomer: receipt.showCustomer,
      showCashTendered: receipt.showCashTendered,
      kitchenShowAddress: cfg.kitchen.showAddress,
      tableNumber: order.table?.tableNumber ?? ticketNumber ?? "—",
      orderNumber: ticketNumber,
      orderType,
      customerName,
      customerAddress,
      customerPhone,
      customerNote,
      scheduledFor,
      orderId: order.id,
      createdAt: order.createdAt.toISOString(),
      total: order.total,
      discountAmount,
      discountLabel,
      surchargeAmount,
      surchargeLabel,
      paymentMethod,
      paymentAmount,
      cashTendered,
      qrUrl: restaurantSiteUrl(restaurant.slug),
      items: order.items.map((i) => {
        const unit = i.unitPrice + i.modifiers.reduce((s, m) => s + m.priceDeltaAtTime, 0);
        return {
          quantity: i.quantity,
          name: i.nameAtTime,
          modifiers: i.modifiers.map((m) => m.nameAtTime),
          note: i.note,
          lineTotal: unit * i.quantity,
        };
      }),
    });
  });
}
