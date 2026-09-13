import { ORDER_TYPE_LABEL, type OrderTypeKey } from "./order-type";

/**
 * Everything that happened on a shift, grouped the way an owner checks it.
 *
 * The Z-report answers one question — what should be in this drawer — and
 * deliberately counts only counter takings. That's correct for a drawer and
 * useless for "show me the whole evening": an owner also wants the online
 * orders, and wants it split by dine-in, takeout, pickup and delivery, because
 * that's how they think about the trade.
 *
 * So the two live side by side rather than being merged. Counter money and
 * online money must never be added into one drawer figure — nobody counted the
 * online money into a till, and a cashier asked to account for it would come up
 * short every night. Every transaction carries `counter`, and the drawer
 * figures only ever look at the ones where it's true.
 *
 * Pure: no database, no clock.
 */

export interface ShiftTransaction {
  orderId: string;
  label: string;
  /** Manila-formatted. */
  at: string;
  orderType: OrderTypeKey;
  method: string;
  amount: number;
  /** True when a cashier took this at the till — i.e. it's drawer money. */
  counter: boolean;
}

export interface Group {
  key: string;
  label: string;
  amount: number;
  count: number;
}

export interface ShiftBreakdown {
  /** Every transaction, counter and online. */
  total: number;
  count: number;
  /** Taken at the till. This is the half that reconciles to the drawer. */
  counterTotal: number;
  counterCount: number;
  /** Paid through the website/gateway — real sales, but not in anyone's till. */
  onlineTotal: number;
  onlineCount: number;
  byOrderType: Group[];
  byMethod: Group[];
}

const METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  card_terminal: "Card",
  gcash: "GCash",
  maya: "Maya",
  online_gcash: "GCash (online)",
  online_card: "Card (online)",
  bank_transfer: "Bank transfer",
  // Grab / Foodpanda: the platform remits later, nothing crossed the counter.
  third_party: "Third-party app",
};

export function methodLabel(method: string): string {
  return METHOD_LABEL[method] ?? method;
}

/** Sum into named groups, biggest first — the order an owner reads them in. */
function group<T>(
  rows: T[],
  keyOf: (r: T) => string,
  labelOf: (key: string) => string,
  amountOf: (r: T) => number,
): Group[] {
  const map = new Map<string, { amount: number; count: number }>();
  for (const r of rows) {
    const k = keyOf(r);
    const cur = map.get(k) ?? { amount: 0, count: 0 };
    map.set(k, { amount: cur.amount + amountOf(r), count: cur.count + 1 });
  }
  return [...map.entries()]
    .map(([key, v]) => ({ key, label: labelOf(key), ...v }))
    .sort((a, b) => b.amount - a.amount || (a.key < b.key ? -1 : 1));
}

export function summariseShift(txns: ShiftTransaction[]): ShiftBreakdown {
  const counter = txns.filter((t) => t.counter);
  const online = txns.filter((t) => !t.counter);
  const sum = (rows: ShiftTransaction[]) => rows.reduce((s, t) => s + t.amount, 0);

  return {
    total: sum(txns),
    count: txns.length,
    counterTotal: sum(counter),
    counterCount: counter.length,
    onlineTotal: sum(online),
    onlineCount: online.length,
    byOrderType: group(
      txns,
      (t) => t.orderType,
      (k) => ORDER_TYPE_LABEL[k as OrderTypeKey] ?? k,
      (t) => t.amount,
    ),
    byMethod: group(txns, (t) => t.method, methodLabel, (t) => t.amount),
  };
}
