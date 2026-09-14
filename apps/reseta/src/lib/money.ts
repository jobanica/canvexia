/** Centavos in, "₱1,234.50" out. Money is integer centavos everywhere. */
export function peso(centavos: number): string {
  const sign = centavos < 0 ? "-" : "";
  const abs = Math.abs(centavos);
  const whole = Math.floor(abs / 100).toLocaleString("en-PH");
  return `${sign}₱${whole}.${String(abs % 100).padStart(2, "0")}`;
}

/** Dates are shown in the pharmacy's own timezone, never the server's. */
export function manilaDate(d: Date): string {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

/**
 * Date AND time, for a document that has to say when.
 *
 * A receipt carries the time of the transaction, not just the day — it is what
 * ties a receipt to a shift, a till and a Z-reading. Manila, always: the server
 * has no business deciding what day a sale happened on.
 */
export function manilaDateTime(d: Date): string {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

/** Month and year only — what an expiry date actually means on a pack. */
export function manilaExpiry(d: Date): string {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    year: "numeric",
  }).format(d);
}
