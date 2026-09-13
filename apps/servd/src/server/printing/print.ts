"use server";

import { tenantDb, systemDb } from "@/server/tenancy/scoped-db";
import type { OrderTypeKey } from "@/lib/orders/order-type";
import { requireStaff } from "@/server/tenancy/current-user";
import { buildTicket, type Ticket, type TicketKind } from "@/lib/printing/ticket";
import { encodeTicketBase64, encodeReportBase64, encodeDrawerKickBase64 } from "@/lib/printing/escpos";
import { drawerPolicy, shouldOpenDrawer } from "@/lib/printing/drawer";
import { parsePrinterConfig, kitchenDestination, isServerDriven } from "@/lib/printing/printer-config";
import { restaurantSiteUrl } from "@/lib/qr";
import { getShiftReport } from "./shift-report";
import { formatOrderNumber } from "@/lib/orders/order-number";

/**
 * PLUGGABLE PRINTING
 *
 * One ticket model, four transports (stored per restaurant as `printMethod`):
 *   network   — POST ESC/POS to a local print-bridge agent (browsers can't open
 *               raw TCP :9100, so a tiny agent at the cashier station relays it).
 *   cloud     — enqueue a PrintJob; the printer POLLS /api/print/cloud/[id].
 *               Works on ANY device (iPad/iPhone included).
 *   bluetooth — handled in the browser (Web Bluetooth, Chromium only).
 *   os_dialog — handled in the browser (print the HTML ticket via the OS dialog).
 *
 * The server handles network + cloud; for the two client transports it returns
 * the ticket data and tells the UI to finish the job.
 */

/**
 * What the cashier's device still has to do after a payment settles.
 *
 * `drawerKickBase64` is only ever set for Bluetooth, where the printer is
 * paired to the browser rather than reachable from the server.
 */
export interface SettleActions {
  clientPrintNeeded: boolean;
  drawerKickBase64?: string;
}

export interface PrintDispatch {
  ok: boolean;
  handledOnServer: boolean;
  clientAction?: "bluetooth" | "os_dialog";
  ticket?: Ticket;
  ticketBase64?: string;
  message: string;
}

type PrinterConfig = {
  bridgeUrl?: string;
  pollToken?: string;
  receipt?: {
    address?: string | null;
    phone?: string | null;
    website?: string | null;
    footer?: string | null;
    showVat?: boolean;
  };
};

async function loadTicket(restaurantId: string, orderId: string) {
  return tenantDb(restaurantId, async (tx) => {
    const restaurant = await tx.restaurant.findFirstOrThrow({
      select: {
        name: true,
        displayName: true,
        slug: true,
        printMethod: true,
        printerConfig: true,
        autoPrint: true,
      },
    });

    // Newer settings — read separately so a database that hasn't run the
    // migration keeps printing exactly as it did before.
    let settings = { autoPrintReceipt: true, openDrawerOn: "cash" };
    try {
      const s = await tx.restaurant.findFirstOrThrow({
        select: { autoPrintReceipt: true, openDrawerOn: true },
      });
      settings = { autoPrintReceipt: s.autoPrintReceipt, openDrawerOn: s.openDrawerOn };
    } catch {
      /* not migrated yet — keep the old always-print behaviour */
    }
    // Explicit select (no SELECT *) so a lagging schema can't break printing.
    const order = await tx.order.findFirst({
      where: { id: orderId },
      select: {
        id: true,
        total: true,
        createdAt: true,
        table: { select: { tableNumber: true } },
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

    // Latest settled payment → tendered line on the receipt (best-effort).
    let payment: { method: string; amount: number } | null = null;
    if (order) {
      try {
        const pay = await tx.payment.findFirst({
          where: { orderId, status: "paid" },
          orderBy: { createdAt: "desc" },
          select: { method: true, amount: true },
        });
        if (pay) payment = { method: pay.method, amount: pay.amount };
      } catch {
        /* no payment yet */
      }
    }

    // Newer columns (discount / order type) — read best-effort.
    let meta: {
      discountAmount: number;
      discountLabel: string | null;
      orderType: OrderTypeKey;
      customerName: string | null;
      customerAddress: string | null;
    } = { discountAmount: 0, discountLabel: null, orderType: "dine_in", customerName: null, customerAddress: null };
    if (order) {
      try {
        const m = await tx.order.findFirst({
          where: { id: orderId },
          select: {
            discountAmount: true,
            discountLabel: true,
            orderType: true,
            customerName: true,
            customerAddress: true,
          },
        });
        if (m) {
          meta = {
            discountAmount: m.discountAmount ?? 0,
            discountLabel: m.discountLabel ?? null,
            orderType: (m.orderType ?? "dine_in") as typeof meta.orderType,
            customerName: m.customerName ?? null,
            customerAddress: m.customerAddress ?? null,
          };
        }
      } catch {
        /* not migrated yet */
      }
    }
    // The day's ticket number, on its own best-effort read.
    //
    // It was never read here at all, which is why an automatically-printed
    // docket came out with no number on it while the kitchen DISPLAY showed
    // one — a shop that runs on order numbers instead of tables had nothing on
    // the paper to call the customer by. Its own query and its own catch, so a
    // lagging column can't take the discount and order-type block down with it.
    let ticketNumber: string | null = null;
    if (order) {
      try {
        const n = await tx.order.findFirst({
          where: { id: orderId },
          select: { orderNumber: true },
        });
        if (n?.orderNumber != null) ticketNumber = formatOrderNumber(n.orderNumber);
      } catch {
        /* orderNumber not migrated yet */
      }
    }

    return { restaurant, order, meta, payment, settings, ticketNumber };
  });
}

/** Build the Ticket for an order (shared by dispatch + the ESC/POS action). */
async function ticketFor(
  restaurantId: string,
  orderId: string,
  kind: TicketKind = "receipt",
): Promise<Ticket | null> {
  const { restaurant, order, meta, payment, ticketNumber } = await loadTicket(restaurantId, orderId);
  if (!order) return null;
  const config = (restaurant.printerConfig as PrinterConfig | null) ?? {};
  const r = config.receipt ?? {};
  return buildTicket({
    kind,
    restaurantName: restaurant.displayName || restaurant.name,
    address: r.address,
    phone: r.phone,
    website: r.website,
    footer: r.footer,
    showVat: r.showVat,
    tableNumber: order.table?.tableNumber ?? "—",
    orderNumber: ticketNumber,
    orderType: meta.orderType,
    customerName: meta.customerName,
    customerAddress: meta.customerAddress,
    orderId: order.id,
    createdAt: order.createdAt.toISOString(),
    total: order.total,
    discountAmount: meta.discountAmount,
    discountLabel: meta.discountLabel,
    paymentMethod: payment?.method ?? null,
    paymentAmount: payment?.amount ?? null,
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
}

/** Core dispatch usable both from the cashier action and from auto-print. */
async function dispatch(
  restaurantId: string,
  orderId: string,
  kind: TicketKind = "receipt",
  openDrawer = false,
): Promise<PrintDispatch> {
  const { restaurant } = await loadTicket(restaurantId, orderId);
  const ticket = await ticketFor(restaurantId, orderId, kind);
  if (!ticket) return { ok: false, handledOnServer: false, message: "Order not found." };
  const config = (restaurant.printerConfig as PrinterConfig | null) ?? {};
  const base64 = encodeTicketBase64(ticket, openDrawer);
  return dispatchBytes(restaurantId, restaurant.printMethod, config, base64, orderId, ticket);
}

/**
 * Open the cash drawer with nothing printed.
 *
 * Needed because the two settings are independent: a till can want the drawer
 * on every cash sale and no paper at all. Only the server-driven transports can
 * do this unattended — a Bluetooth printer is paired to the cashier's browser,
 * so the board is told to send the pulse itself.
 */
async function dispatchDrawerKick(restaurantId: string): Promise<SettleActions> {
  const restaurant = await tenantDb(restaurantId, (tx) =>
    tx.restaurant.findFirstOrThrow({ select: { printMethod: true, printerConfig: true } }),
  );
  const config = (restaurant.printerConfig as PrinterConfig | null) ?? {};
  if (restaurant.printMethod === "network" || restaurant.printMethod === "cloud") {
    await dispatchBytes(restaurantId, restaurant.printMethod, config, encodeDrawerKickBase64(), null);
    return { clientPrintNeeded: false };
  }
  // A browser print dialog sends a page, not a printer control code, so
  // os_dialog can't reach the drawer at all. Bluetooth can — the cashier's own
  // device holds the connection, so it sends the pulse itself.
  return {
    clientPrintNeeded: false,
    drawerKickBase64:
      restaurant.printMethod === "bluetooth" ? encodeDrawerKickBase64() : undefined,
  };
}

/** Which printer a job is for. A till may have a second one in the kitchen. */
export type PrintStation = "till" | "kitchen";

/**
 * Write the PrintJob row, tagging which printer it's for.
 *
 * `station` arrives in a manual migration, and a cloud job that can't be
 * written is a ticket that never prints — so a missing column falls back to an
 * untagged row. The poll endpoint treats untagged jobs as the till's, which is
 * exactly what they were before the column existed.
 */
async function recordJob(
  restaurantId: string,
  orderId: string | null,
  method: "network" | "cloud",
  payloadBase64: string,
  status: string,
  station: PrintStation,
): Promise<void> {
  const base = {
    restaurantId,
    orderId,
    method,
    payloadBase64,
    status,
    printedAt: status === "printed" ? new Date() : null,
  };
  try {
    await systemDb((tx) => tx.printJob.create({ data: { ...base, station } }));
  } catch {
    try {
      await systemDb((tx) => tx.printJob.create({ data: base }));
    } catch {
      /* the job is logging, not the print itself — never fail the sale for it */
    }
  }
}

/**
 * Send an already-encoded ESC/POS payload out over whichever transport this
 * restaurant uses.
 *
 * Split out of `dispatch` so documents that aren't orders — the end-of-shift
 * report — reach the printer exactly the same way a receipt does. Anything that
 * routes around this ends up as a browser print dialog talking to a printer
 * that was never connected to the browser, which is precisely the bug this
 * exists to prevent.
 */
async function dispatchBytes(
  restaurantId: string,
  printMethod: string,
  config: PrinterConfig,
  base64: string,
  orderId: string | null,
  ticket?: Ticket,
  station: PrintStation = "till",
): Promise<PrintDispatch> {
  switch (printMethod) {
    case "network": {
      if (!config.bridgeUrl) {
        return { ok: false, handledOnServer: true, message: "No print-bridge URL configured." };
      }
      let status = "printed";
      try {
        const res = await fetch(config.bridgeUrl, {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: Buffer.from(base64, "base64"),
        });
        if (!res.ok) status = "failed";
      } catch {
        status = "failed";
      }
      await recordJob(restaurantId, orderId, "network", base64, status, station);
      return {
        ok: status === "printed",
        handledOnServer: true,
        message: status === "printed" ? "Sent to printer." : "Printer didn't respond.",
      };
    }
    case "cloud": {
      await recordJob(restaurantId, orderId, "cloud", base64, "queued", station);
      return { ok: true, handledOnServer: true, message: "Queued — the printer will pick it up." };
    }
    case "bluetooth":
      return { ok: true, handledOnServer: false, clientAction: "bluetooth", ticketBase64: base64, message: "" };
    case "os_dialog":
    default:
      // Include the bytes too, so a connected Web Bluetooth printer can print
      // even when the configured method is the OS dialog.
      return { ok: true, handledOnServer: false, clientAction: "os_dialog", ticket, ticketBase64: base64, message: "" };
  }
}

/**
 * Print the END-OF-SHIFT report on the receipt printer.
 *
 * Previously this was a browser tab that fired window.print(), which only ever
 * worked if the till happened to have an OS-level printer — for the network,
 * cloud and Bluetooth setups (which is most of them) nothing came out at all.
 * It now takes exactly the same path as a receipt.
 */
export async function printShiftSummaryTicket(): Promise<PrintDispatch> {
  const bundle = await getShiftReport();
  if (!bundle) {
    return { ok: false, handledOnServer: false, message: "Couldn't load the shift summary." };
  }
  return dispatchBytes(
    bundle.restaurantId,
    bundle.printMethod,
    bundle.printerConfig,
    encodeReportBase64(bundle.report),
    null, // not tied to an order
  );
}

/** Cashier-triggered print — a BILL (amount the customer must pay). */
export async function printOrderTicket(orderId: string): Promise<PrintDispatch> {
  let staff;
  try {
    staff = await requireStaff(["cashier", "admin"]);
  } catch {
    return { ok: false, handledOnServer: false, message: "Not allowed." };
  }
  return dispatch(staff.restaurantId, orderId, "bill");
}

/** Print the paid RECEIPT (after payment) — same transports as the bill. */
export async function printPaidTicket(orderId: string): Promise<PrintDispatch> {
  let staff;
  try {
    staff = await requireStaff(["cashier", "admin"]);
  } catch {
    return { ok: false, handledOnServer: false, message: "Not allowed." };
  }
  return dispatch(staff.restaurantId, orderId, "receipt");
}

/** Print a KITCHEN ticket (items only) — used when there's no kitchen display. */
export async function printKitchenTicket(orderId: string): Promise<PrintDispatch> {
  let staff;
  try {
    // The merchant "Incoming Orders" screen also auto-prints kitchen tickets.
    staff = await requireStaff(["cashier", "admin", "merchant"]);
  } catch {
    return { ok: false, handledOnServer: false, message: "Not allowed." };
  }
  return dispatchKitchen(staff.restaurantId, orderId);
}

/**
 * Send a kitchen docket, to the kitchen's own printer where there is one.
 *
 * A restaurant with a printer at the pass and none of the screens wants the
 * docket to come out THERE — the cashier's roll is for the bill. So when a
 * separate kitchen printer is configured the ticket is aimed at it, on its own
 * transport, and the till's method stops mattering: the cashier can be on a
 * Bluetooth printer and the kitchen still prints from the server, unattended.
 *
 * With no kitchen printer set up this is exactly the old behaviour — one
 * printer, both documents.
 */
async function dispatchKitchen(restaurantId: string, orderId: string): Promise<PrintDispatch> {
  const { restaurant } = await loadTicket(restaurantId, orderId);
  const kitchen = kitchenDestination(parsePrinterConfig(restaurant.printerConfig).kitchen);
  if (!kitchen) return dispatch(restaurantId, orderId, "kitchen");

  const ticket = await ticketFor(restaurantId, orderId, "kitchen");
  if (!ticket) return { ok: false, handledOnServer: false, message: "Order not found." };
  return dispatchBytes(
    restaurantId,
    kitchen.method,
    { bridgeUrl: kitchen.bridgeUrl ?? undefined, pollToken: kitchen.pollToken ?? undefined },
    encodeTicketBase64(ticket, false),
    orderId,
    ticket,
    "kitchen",
  );
}

/** Whether this restaurant prints kitchen tickets instead of using a display. */
async function kitchenPrintMode(restaurantId: string): Promise<boolean> {
  try {
    const r = await tenantDb(restaurantId, (tx) =>
      tx.restaurant.findFirst({ select: { kitchenDisplay: true } }),
    );
    return r?.kitchenDisplay === false; // false = print mode
  } catch {
    return false; // column not migrated yet → keep the display behaviour
  }
}

/**
 * When an order enters the kitchen and the restaurant has NO display, print a
 * kitchen ticket. Server transports (network/cloud) print unattended; browser
 * transports return clientPrintNeeded so the cashier board prints it.
 */
export async function printKitchenIfNeeded(
  restaurantId: string,
  orderId: string,
): Promise<{ clientPrintNeeded: boolean }> {
  if (!(await kitchenPrintMode(restaurantId))) return { clientPrintNeeded: false };
  const { restaurant } = await loadTicket(restaurantId, orderId);

  // A dedicated kitchen printer on a server transport takes the cashier's
  // device out of it entirely — no print dialog opening at the till for a
  // docket that belongs at the pass, and nothing lost if the tablet is asleep.
  //
  // A Bluetooth one is the opposite: the pairing lives in the cashier's
  // browser, so the board has to send it. Same as the till's Bluetooth path,
  // just aimed at the other device.
  const kitchen = kitchenDestination(parsePrinterConfig(restaurant.printerConfig).kitchen);
  if (kitchen) {
    if (isServerDriven(kitchen.method)) {
      await dispatchKitchen(restaurantId, orderId);
      return { clientPrintNeeded: false };
    }
    return { clientPrintNeeded: true };
  }

  if (restaurant.printMethod === "network" || restaurant.printMethod === "cloud") {
    await dispatch(restaurantId, orderId, "kitchen");
    return { clientPrintNeeded: false };
  }
  return { clientPrintNeeded: true };
}

/**
 * Auto-print a ticket. The server-handled transports (network/cloud) print
 * unattended here. For the browser transports (bluetooth/os_dialog) the server
 * can't print on its own, so we return `clientPrintNeeded: true` and the cashier
 * board opens the printable ticket page (which auto-fires the print dialog).
 */
export async function autoPrintIfEnabled(
  restaurantId: string,
  orderId: string,
): Promise<{ clientPrintNeeded: boolean }> {
  const { restaurant } = await loadTicket(restaurantId, orderId);
  if (!restaurant.autoPrint) return { clientPrintNeeded: false };
  if (restaurant.printMethod === "network" || restaurant.printMethod === "cloud") {
    await dispatch(restaurantId, orderId, "bill"); // new order, not yet paid
    return { clientPrintNeeded: false };
  }
  return { clientPrintNeeded: true };
}

/**
 * Settle-time printing: the receipt, and the cash drawer.
 *
 * Both are now settings rather than fixed behaviour. The receipt used to print
 * on every settled payment with no way to stop it, which is a roll of paper a
 * day for a till whose customers don't take one. The drawer never opened at
 * all, so cashiers were pulling it by hand on every sale.
 *
 * They're independent, hence the two branches: paper with a drawer pulse in
 * front of it, a bare pulse, or nothing. The pulse leads so the drawer is
 * already open by the time the receipt is torn off.
 */
export async function printReceipt(
  restaurantId: string,
  orderId: string,
): Promise<SettleActions> {
  const { restaurant, settings, payment } = await loadTicket(restaurantId, orderId);
  const openDrawer = shouldOpenDrawer(drawerPolicy(settings.openDrawerOn), payment?.method);

  if (!settings.autoPrintReceipt) {
    return openDrawer ? dispatchDrawerKick(restaurantId) : { clientPrintNeeded: false };
  }
  if (restaurant.printMethod === "network" || restaurant.printMethod === "cloud") {
    // One job: the pulse rides in front of the receipt.
    await dispatch(restaurantId, orderId, "receipt", openDrawer);
    return { clientPrintNeeded: false };
  }
  // Browser transports print the receipt from the cashier's device, so the
  // drawer goes as its own pulse rather than being folded into those bytes.
  const kick = openDrawer ? await dispatchDrawerKick(restaurantId) : null;
  return { clientPrintNeeded: true, drawerKickBase64: kick?.drawerKickBase64 };
}

/**
 * Open the cash drawer on demand — the "no sale" button every till has.
 *
 * (An explicitly requested receipt still goes through printPaidTicket, which
 * always prints: the auto-print setting decides whether to print WITHOUT being
 * asked, so applying it to a button press would make the button do nothing.)
 */
export async function openCashDrawer(): Promise<
  { ok: boolean; message: string; drawerKickBase64?: string }
> {
  let staff;
  try {
    staff = await requireStaff(["cashier", "admin"]);
  } catch {
    return { ok: false, message: "Not allowed." };
  }
  try {
    const r = await dispatchDrawerKick(staff.restaurantId);
    return { ok: true, message: "", drawerKickBase64: r.drawerKickBase64 };
  } catch {
    return { ok: false, message: "Couldn't reach the printer." };
  }
}
