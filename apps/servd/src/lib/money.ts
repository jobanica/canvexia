/**
 * MONEY HANDLING
 *
 * We store all money as INTEGER centavos in the database (see schema comments)
 * to avoid floating-point rounding errors on prices and totals. The UI works in
 * pesos, so convert at the boundary.
 *
 *   ₱250.00  <->  25000 centavos
 */

/** Parse a peso string/number from a form into integer centavos. */
export function pesosToCentavos(input: string | number): number {
  const pesos = typeof input === "number" ? input : parseFloat(input);
  if (Number.isNaN(pesos)) throw new Error("Invalid amount");
  return Math.round(pesos * 100);
}

/** Centavos -> a number of pesos (for form default values). */
export function centavosToPesos(centavos: number): number {
  return centavos / 100;
}

/** Format centavos as a display string, e.g. 25000 -> "₱250.00". */
export function formatPeso(centavos: number): string {
  const sign = centavos < 0 ? "-" : "";
  const abs = Math.abs(centavos);
  return `${sign}₱${(abs / 100).toFixed(2)}`;
}

/** Format a modifier price delta, e.g. 3000 -> "+₱30.00", 0 -> "". */
export function formatDelta(centavos: number): string {
  if (centavos === 0) return "";
  return centavos > 0 ? `+${formatPeso(centavos)}` : formatPeso(centavos);
}

/**
 * Amounts a customer is plausibly holding for a given bill: the exact total,
 * then the next round figures up.
 *
 * Rounds to the next 100 / 500 / 1000 rather than to arbitrary note multiples —
 * for a ₱465 bill that gives ₱500 and ₱1,000, which is what someone actually
 * hands over. Rounding to the next ₱20 would offer ₱480, which nobody does.
 *
 * Offered as taps rather than a bare number field because the point is to know
 * the change BEFORE they arrive, and a field nobody fills in tells the counter
 * nothing — which is exactly what happened when this lived in the free-text
 * instructions box.
 */
export function cashSuggestions(totalCentavos: number): number[] {
  const total = Math.max(0, Math.round(totalCentavos));
  const steps = [10_000, 50_000, 100_000]; // ₱100, ₱500, ₱1,000
  const out = [total];
  for (const step of steps) {
    const up = Math.ceil(total / step) * step;
    if (up > total && !out.includes(up)) out.push(up);
  }
  return out.slice(0, 4);
}
