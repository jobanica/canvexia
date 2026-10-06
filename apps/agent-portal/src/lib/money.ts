/** Centavos in, "₱1,234.50" out. Money is integer centavos everywhere. */
export function peso(centavos: number): string {
  const sign = centavos < 0 ? "-" : "";
  const abs = Math.abs(centavos);
  const whole = Math.floor(abs / 100).toLocaleString("en-PH");
  return `${sign}₱${whole}.${String(abs % 100).padStart(2, "0")}`;
}

/** "1,234.50" or "500" → 123450 / 50000. Null for anything else. */
export function parsePesos(input: string | null | undefined): number | null {
  if (input == null) return null;
  const s = input.replace(/[₱,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}
