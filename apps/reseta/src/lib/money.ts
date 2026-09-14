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
