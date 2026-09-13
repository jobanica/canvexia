/**
 * The order ticket / receipt — built ONCE as structured data, then rendered to
 * either ESC/POS bytes (thermal printers) or printable HTML (OS dialog). Header
 * (name + contact) and footer are customizable in Printer settings; the body is
 * an itemized, VAT-inclusive receipt and the QR points to the restaurant's site.
 */

import { orderTypeLabel, type OrderTypeKey } from "@/lib/orders/order-type";
import { scheduledTicketLabel } from "@/lib/orders/scheduled";
import { manilaDateTime } from "@/lib/time/manila";

const VAT_RATE = 0.12;
export const WIDTH = 32; // characters per line (58mm thermal; 80mm just has slack)

/** Right-align `right` against `left` within WIDTH characters. */
export function pad(left: string, right: string, width = WIDTH): string {
  const space = width - left.length - right.length;
  return space >= 1 ? left + " ".repeat(space) + right : `${left} ${right}`;
}
/** Plain decimal (no currency glyph — thermal printers can't render ₱). */
export function amt(centavos: number): string {
  return (centavos / 100).toFixed(2);
}

export interface TicketLine {
  quantity: number;
  name: string;
  modifiers: string[];
  note?: string | null;
  lineTotal: number; // centavos
}

export interface ReceiptBranding {
  address?: string | null;
  phone?: string | null;
  website?: string | null;
  footer?: string | null;
  showVat?: boolean; // print the "VAT (12% incl.)" line (default true)
  showCustomer?: boolean; // print who the order is for, and where (default true)
  showCashTendered?: boolean; // print cash received + change (default true)
  kitchenShowAddress?: boolean; // put the address on kitchen tickets (default false)
}

const METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  card_terminal: "Card",
  gcash: "GCash",
  maya: "Maya",
  online_gcash: "GCash",
  online_card: "Card (online)",
  bank_transfer: "Bank transfer",
  third_party: "Third-party app",
};

/**
 * "bill" = pre-payment (amount due); "receipt" = post-payment (paid);
 * "kitchen" = prep ticket for the kitchen (items only, no prices).
 */
export type TicketKind = "bill" | "receipt" | "kitchen";

export interface Ticket {
  kind: TicketKind;
  restaurantName: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  footer: string | null;
  showVat: boolean;
  showCustomer: boolean;
  showCashTendered: boolean;
  kitchenShowAddress: boolean;
  tableNumber: string;
  /**
   * The day's ticket number, already formatted ("#007"), or null.
   *
   * What a counter customer is actually called by. Separate from tableNumber
   * because an order can have both, one, or neither, and the heading has to
   * pick — a takeout ticket has a number and never a table.
   */
  orderNumber: string | null;
  orderType: OrderTypeKey;
  customerName: string | null;
  customerAddress: string | null;
  customerPhone: string | null;
  customerNote: string | null;
  /** Advance order: when it's wanted for, ISO. Null on an ordinary order. */
  scheduledFor: string | null;
  orderRef: string;
  placedAt: string;
  items: TicketLine[];
  total: number; // gross items (centavos)
  discountAmount: number;
  discountLabel: string | null;
  surchargeAmount: number; // card fee added on top (centavos)
  surchargeLabel: string | null;
  paymentMethod: string | null;
  paymentAmount: number | null;
  cashTendered: number | null; // what the customer actually handed over
  qrUrl: string | null; // website link encoded as a QR
}

export interface TicketSource extends ReceiptBranding {
  kind?: TicketKind;
  restaurantName: string;
  tableNumber: string;
  orderNumber?: string | null;
  orderType?: OrderTypeKey;
  customerName?: string | null;
  customerAddress?: string | null;
  customerPhone?: string | null;
  customerNote?: string | null;
  scheduledFor?: string | null;
  orderId: string;
  createdAt: string;
  total: number;
  discountAmount?: number;
  discountLabel?: string | null;
  surchargeAmount?: number | null;
  surchargeLabel?: string | null;
  paymentMethod?: string | null;
  paymentAmount?: number | null;
  cashTendered?: number | null;
  qrUrl?: string | null;
  items: { quantity: number; name: string; modifiers: string[]; note?: string | null; lineTotal: number }[];
}

export function buildTicket(src: TicketSource): Ticket {
  return {
    kind: src.kind ?? "receipt",
    restaurantName: src.restaurantName,
    address: src.address ?? null,
    phone: src.phone ?? null,
    website: src.website ?? null,
    footer: src.footer ?? null,
    showVat: src.showVat !== false, // default to showing VAT
    showCustomer: src.showCustomer !== false,
    showCashTendered: src.showCashTendered !== false,
    kitchenShowAddress: src.kitchenShowAddress === true,
    tableNumber: src.tableNumber,
    orderNumber: src.orderNumber ?? null,
    orderType: src.orderType ?? "dine_in",
    customerName: src.customerName ?? null,
    customerAddress: src.customerAddress ?? null,
    customerPhone: src.customerPhone ?? null,
    customerNote: src.customerNote ?? null,
    scheduledFor: src.scheduledFor ?? null,
    orderRef: src.orderId.slice(0, 8).toUpperCase(),
    placedAt: src.createdAt,
    items: src.items.map((i) => ({
      quantity: i.quantity,
      name: i.name,
      modifiers: i.modifiers,
      note: i.note ?? null,
      lineTotal: i.lineTotal,
    })),
    total: src.total,
    discountAmount: src.discountAmount ?? 0,
    discountLabel: src.discountLabel ?? null,
    surchargeAmount: src.surchargeAmount ?? 0,
    surchargeLabel: src.surchargeLabel ?? null,
    // Only a paid receipt shows a payment line (bills/kitchen tickets never do).
    paymentMethod: src.kind === "receipt" ? src.paymentMethod ?? null : null,
    paymentAmount: src.kind === "receipt" ? src.paymentAmount ?? null : null,
    cashTendered: src.kind === "receipt" ? src.cashTendered ?? null : null,
    // The kitchen ticket carries no QR (it's for the cooks, not the diner).
    qrUrl: src.kind === "kitchen" ? null : src.qrUrl ?? null,
  };
}

/** The document label printed under the heading. */
export function ticketDocLabel(t: Ticket): string {
  if (t.kind === "bill") return "*** BILL ***";
  if (t.kind === "kitchen") return "*** KITCHEN ***";
  return "*** OFFICIAL RECEIPT ***";
}

/** Net payable + VAT-of-net (centavos). */
export function ticketTotals(t: Ticket) {
  const net = Math.max(0, t.total - t.discountAmount + Math.max(0, t.surchargeAmount));
  const vat = Math.round(net - net / (1 + VAT_RATE));
  return { net, vat };
}

/**
 * The big heading line: table number, or PICKUP/DELIVERY + customer.
 *
 * A dine-in ticket with no table is called by its daily number instead — plenty
 * of shops ring the order up at the counter and seat people afterwards, and
 * "TABLE —" is not something anyone can shout across a room.
 */
export function ticketHeading(t: Ticket): string {
  // A "#001" arriving in tableNumber is a ticket number, not a table — one
  // caller has always smuggled it through that field, so both are accepted.
  const number =
    t.orderNumber?.trim() || (t.tableNumber.startsWith("#") ? t.tableNumber : null);

  if (t.orderType === "dine_in") {
    if (t.tableNumber && t.tableNumber !== "—" && !t.tableNumber.startsWith("#")) {
      return `TABLE ${t.tableNumber}`;
    }
    return number ? `ORDER ${number}` : "ORDER";
  }

  // Same word as the cashier screen and the kitchen display, in caps for paper.
  // The NUMBER goes next to it: a shop running on ticket numbers calls "takeout
  // seven", and a docket that says only "TAKEOUT - Ana" leaves the pass with
  // nothing to match against the customer waiting at the counter.
  const label = orderTypeLabel(t.orderType).toUpperCase();
  const head = number ? `${label} ${number}` : label;
  const name = t.customerName?.trim();
  if (!name) return head;
  // The number is what gets called out, so it wins if the line won't fit.
  const withName = `${head} - ${name}`;
  return withName.length <= WIDTH ? withName : head;
}

/** Centered header: restaurant name + any contact lines. */
export function ticketHeaderLines(t: Ticket): string[] {
  const lines = [t.restaurantName];
  if (t.address) lines.push(t.address);
  if (t.phone) lines.push(t.phone);
  if (t.website) lines.push(t.website);
  return lines;
}

/**
 * Who this order is for, and where it's going.
 *
 * This is the block a rider reads. Before it existed the docket said "DELIVERY
 * - Ana" and nothing else, so the address came off Facebook or the app and the
 * number to ring when they were outside the gate came off neither. Wrapped so a
 * long address doesn't run off the side of 58mm paper.
 */
export function ticketCustomerLines(t: Ticket): string[] {
  if (!t.showCustomer) return [];
  // A dine-in ticket already says which table; nobody is delivering to it.
  if (t.orderType === "dine_in") return [];
  // Not on a kitchen docket. The cooks don't ring customers, and the address —
  // if this kitchen works by zone — is printed once by the kitchen's own
  // setting. Printing it here too gave every delivery ticket the same address
  // twice, and put a customer's home address on the pass for kitchens that had
  // deliberately turned that off.
  if (t.kind === "kitchen") return [];
  const lines: string[] = [];
  if (t.customerName) lines.push(`Name : ${t.customerName}`);
  if (t.customerPhone) lines.push(`Phone: ${t.customerPhone}`);
  if (t.orderType === "delivery" && t.customerAddress) {
    lines.push(...wrap(t.customerAddress, "Addr : ", "       "));
  }
  if (t.customerNote) lines.push(...wrap(t.customerNote, "Note : ", "       "));
  if (lines.length === 0) return [];
  return ["--------------------------------", ...lines];
}

/** Break `text` onto WIDTH-character lines, indenting continuations. */
function wrap(text: string, prefix: string, indent: string): string[] {
  const out: string[] = [];
  let line = prefix;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line.length + word.length + 1 > WIDTH && line.trim() !== prefix.trim()) {
      out.push(line.trimEnd());
      line = indent;
    }
    line += (line === prefix || line === indent ? "" : " ") + word;
  }
  if (line.trim()) out.push(line.trimEnd());
  return out;
}

/**
 * "*** SCHEDULED FOR ***" and the day, boxed off so it can't be skimmed past.
 *
 * Nothing at all on an ordinary order — every ticket carrying a banner is a
 * banner nobody reads.
 */
export function scheduledLines(t: Ticket): string[] {
  const when = scheduledTicketLabel(t.scheduledFor);
  if (!when) return [];
  const rule = "*".repeat(WIDTH);
  const box = [rule, center("*** SCHEDULED FOR ***"), center(when)];
  // Only the kitchen is told not to start. The customer's copy just states when
  // their order is for.
  if (t.kind === "kitchen") box.push(center("*** DO NOT COOK YET ***"));
  box.push(rule);
  return box;
}

/** Centre text in the paper width. The body prints left-aligned. */
function center(s: string): string {
  const pad = Math.max(0, Math.floor((WIDTH - s.length) / 2));
  return " ".repeat(pad) + s;
}

/** Left-aligned body: meta, itemized lines with prices, totals, payment. */
export function ticketBodyLines(t: Ticket): string[] {
  const lines: string[] = [];

  // Kitchen ticket = prep list only: quantities, items, modifiers and notes.
  // No prices, totals, VAT or payment — the cooks just need what to make.
  if (t.kind === "kitchen") {
    // First thing on the docket, above the order number. A kitchen ticket that
    // buries the date reads as "cook this now" — which is the one thing an
    // advance order must never be mistaken for.
    lines.push(...scheduledLines(t));
    lines.push(`Order #${t.orderRef}`);
    // Manila, always. The ticket is built on the server, which runs in UTC, so
    // a bare toLocaleString() printed 4:54 AM on an order placed at 12:54 PM.
    lines.push(manilaDateTime(t.placedAt));
    // The address, when the kitchen works by zone — everything heading the same
    // way gets cooked and bagged in one run instead of one ticket at a time.
    if (t.kitchenShowAddress && t.orderType === "delivery" && t.customerAddress) {
      lines.push(...wrap(t.customerAddress, "To: ", "    "));
    }
    lines.push("--------------------------------");
    for (const item of t.items) {
      lines.push(`${item.quantity}x ${item.name}`);
      for (const mod of item.modifiers) lines.push(`   + ${mod}`);
      if (item.note) lines.push(`   ! ${item.note}`);
    }
    return lines;
  }

  lines.push(...scheduledLines(t));
  const docLabel = t.kind === "bill" ? "Bill" : "Receipt";
  lines.push(`${docLabel} #${t.orderRef}`);
  // See above: the customer's copy has to agree with the wall clock, and with
  // the timestamp on the GCash/Maya payment they just made.
  lines.push(manilaDateTime(t.placedAt));
  lines.push("--------------------------------");
  for (const item of t.items) {
    lines.push(pad(`${item.quantity}x ${item.name}`, amt(item.lineTotal)));
    for (const mod of item.modifiers) lines.push(`   + ${mod}`);
    if (item.note) lines.push(`   ! ${item.note}`);
  }
  lines.push("--------------------------------");
  const { net, vat } = ticketTotals(t);
  // A subtotal only earns its line once something moves the total away from it.
  if (t.discountAmount > 0 || t.surchargeAmount > 0) {
    lines.push(pad("Subtotal", amt(t.total)));
  }
  if (t.discountAmount > 0) {
    lines.push(pad(t.discountLabel ?? "Discount", `-${amt(t.discountAmount)}`));
  }
  // Itemised, not folded into the total: somebody paying 3.5% extra to use a
  // card is entitled to see the 3.5% rather than a number that doesn't match
  // the menu.
  if (t.surchargeAmount > 0) {
    lines.push(pad(t.surchargeLabel ?? "Card fee", amt(t.surchargeAmount)));
  }
  if (t.showVat) lines.push(pad("VAT (12% incl.)", amt(vat)));
  // Bill = amount the customer must PAY; receipt = total they paid.
  lines.push(pad(t.kind === "bill" ? "AMOUNT DUE (PHP)" : "TOTAL (PHP)", amt(net)));

  if (t.kind === "bill") {
    lines.push("");
    lines.push("Please pay at the counter.");
  } else if (t.paymentMethod) {
    lines.push(pad(METHOD_LABEL[t.paymentMethod] ?? t.paymentMethod, amt(t.paymentAmount ?? net)));
    // Cash handed over and change given back. Printing it settles the argument
    // that starts when somebody says they gave a thousand, and it lets the
    // customer check their change on the walk out rather than at the counter.
    if (t.showCashTendered && t.paymentMethod === "cash" && t.cashTendered != null && t.cashTendered > 0) {
      lines.push(pad("Cash received", amt(t.cashTendered)));
      lines.push(pad("Change", amt(Math.max(0, t.cashTendered - net))));
    }
    lines.push("*** PAID ***");
  }
  return lines;
}

/** Centered footer (custom message), split across lines. */
export function ticketFooterLines(t: Ticket): string[] {
  if (!t.footer) return [];
  return t.footer.split("\n").map((s) => s.trim()).filter(Boolean);
}

/** Full plain-text rendering (HTML fallback / preview). */
export function ticketLines(ticket: Ticket): string[] {
  const footer = ticketFooterLines(ticket);
  return [
    ...ticketHeaderLines(ticket),
    ticketHeading(ticket),
    ticketDocLabel(ticket),
    ...ticketCustomerLines(ticket),
    ...ticketBodyLines(ticket),
    ...(footer.length ? ["", ...footer] : []),
  ];
}
