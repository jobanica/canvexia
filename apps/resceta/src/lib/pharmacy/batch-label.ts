import { peso, manilaExpiry } from "@/lib/money";

/**
 * How one batch reads in a picker.
 *
 * REPORTED — clicking Adjustments returned "Application error: a server-side
 * exception has occurred", digest 597542042.
 *
 * WHY IT LIVES HERE. This used to be exported from `WriteoffForm.tsx`, which
 * begins `"use client"`. Next wraps EVERY export of a client module as a client
 * reference — a stub whose only job is to be serialised to the browser — so the
 * server page importing it and calling it got "Attempted to call batchLabel()
 * from the server but batchLabel is on the client", and the page 500ed before
 * it rendered anything. The comment above it even said "build the option label
 * on the server side of the boundary", which was the intent and not the effect.
 *
 * `"use client"` is not a hint about where code runs. It is the boundary marker
 * itself, and everything a module exports past it belongs to the browser. A
 * pure helper shared across that line belongs to NEITHER side — so it lives in
 * lib/, like the icon map did after the same mistake in the nav.
 */
export interface LabelledBatch {
  productName: string;
  lotNumber: string | null;
  expiryDate: Date | null;
  quantity: number;
  costCentavos: number;
  unit: string;
}

export function batchLabel(b: LabelledBatch): string {
  const bits = [b.productName];
  if (b.lotNumber) bits.push(`lot ${b.lotNumber}`);
  // "no expiry" rather than a blank: undated stock never reaches the expiry
  // alerts, and the person writing it off is the one who can fix that.
  bits.push(b.expiryDate ? `exp ${manilaExpiry(b.expiryDate)}` : "no expiry");
  bits.push(`${b.quantity} ${b.unit}`);
  bits.push(`${peso(b.costCentavos)} each`);
  return bits.join(" · ");
}
