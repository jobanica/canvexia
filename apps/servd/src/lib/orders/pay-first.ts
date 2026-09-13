import type { OrderTypeKey } from "./order-type";

/**
 * Shops where you pay before you sit down.
 *
 * A whole class of restaurant here works this way: the customer walks to the
 * counter, orders, pays, and only then finds a table. The till had no way to
 * express that — every POS order was created unpaid and settled later off the
 * board, so a cashier taking money up front had to punch the order, find it
 * again on the floor, and settle it as a second job while a queue built up
 * behind them.
 *
 * WHICH TYPES. The customer has to actually be standing there for "pay first"
 * to mean anything:
 *
 *   dine_in — orders at the counter, then sits. The case this was asked for.
 *   takeout — orders AT the counter and waits for it. Same queue, same till.
 *   pickup  — ordered ahead, coming to collect. They aren't there yet.
 *   delivery / third_party — cash on delivery is the norm; the money arrives
 *             with the rider, not at the till.
 *
 * So the default applies to the first two. It is only ever a DEFAULT: the
 * cashier can take payment on any order type, and can send any order unpaid.
 * Nothing here forbids anything — it decides which button is the big one.
 *
 * Pure, so the rule is testable and safe to import into the POS component.
 */

/** Order types where the customer is at the counter when they order. */
export const PAY_FIRST_TYPES: readonly OrderTypeKey[] = ["dine_in", "takeout"];

export function isCounterType(orderType: OrderTypeKey): boolean {
  return PAY_FIRST_TYPES.includes(orderType);
}

/**
 * Should the till lead with "Take payment" for this order?
 *
 * @param enabled the restaurant's pay-first setting
 */
export function shouldPayFirst(orderType: OrderTypeKey, enabled: boolean): boolean {
  return enabled && isCounterType(orderType);
}
