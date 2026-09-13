/**
 * Mandatory reason codes for voiding an order or editing out a line item.
 * Shared by the cashier UI and the server (the server re-validates — a reason
 * is required and must be one of these).
 */
export const VOID_REASONS = [
  "Customer changed mind",
  "Wrong order / mistake",
  "Item out of stock",
  "Kitchen error",
  "Duplicate order",
  "Test / training",
  "Other",
] as const;

export type VoidReason = (typeof VOID_REASONS)[number];

export function isVoidReason(v: string): v is VoidReason {
  return (VOID_REASONS as readonly string[]).includes(v);
}
