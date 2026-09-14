/**
 * Checking a delivery before it becomes stock.
 *
 * Receiving is the only place stock enters the system, so it is the only place
 * a bad expiry date, a missing lot number or a fat-fingered quantity can be
 * caught cheaply. Everything downstream — FEFO, the expiry report, the recall
 * trail — is only as good as what this lets through.
 *
 * Two severities, and the distinction is the whole design:
 *
 *   ERROR   the line is refused. Reserved for things that are wrong rather
 *           than merely unusual, because a receiving screen that blocks a
 *           real delivery gets worked around, and the workaround is worse
 *           than the thing it avoided.
 *
 *   WARNING shown, and the delivery still goes through. Short-dated stock
 *           bought cheap is a normal trade; a missing lot number on a box of
 *           surgical tape is normal. Both are worth seeing and neither is
 *           worth refusing.
 *
 * Pure, so all of it is testable without a database or a browser. Dates are
 * compared in Asia/Manila for the same reason FEFO is — see fefo.ts.
 */

export interface DeliveryLine {
  /** An existing product, or null when the line creates one. */
  productId: string | null;
  /** Set only when creating: the new product's name. */
  newProductName?: string;
  /** Centavos. Set only when creating. */
  newProductPriceCentavos?: number;
  lotNumber: string | null;
  /** null means "no expiry printed on the pack", stated deliberately. */
  expiryDate: string | null;
  quantity: number;
  unitCostCentavos: number;
}

export type Severity = "error" | "warning";

export interface LineIssue {
  index: number;
  severity: Severity;
  field: "product" | "lotNumber" | "expiryDate" | "quantity" | "unitCostCentavos";
  message: string;
}

/** Stock this close to expiry is flagged, not refused. */
export const SHORT_DATED_DAYS = 90;

export function checkDelivery(
  lines: DeliveryLine[],
  asOf: Date = new Date(),
): LineIssue[] {
  const issues: LineIssue[] = [];
  const today = manilaDay(asOf);
  const shortDatedCutoff = addDays(today, SHORT_DATED_DAYS);

  lines.forEach((line, index) => {
    const err = (field: LineIssue["field"], message: string) =>
      issues.push({ index, severity: "error", field, message });
    const warn = (field: LineIssue["field"], message: string) =>
      issues.push({ index, severity: "warning", field, message });

    if (!line.productId && !line.newProductName?.trim()) {
      err("product", "Pick a product, or give a name for a new one.");
    }
    if (!line.productId && line.newProductName?.trim()) {
      const price = line.newProductPriceCentavos ?? 0;
      if (price <= 0) {
        // A product that sells for nothing is a product someone forgot to
        // price, and the till will happily hand it out free.
        err("product", "A new product needs a selling price.");
      }
    }

    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      err("quantity", "Quantity must be a whole number above zero.");
    }
    if (!Number.isInteger(line.unitCostCentavos) || line.unitCostCentavos < 0) {
      err("unitCostCentavos", "Unit cost can't be negative.");
    } else if (line.unitCostCentavos === 0) {
      // Free stock is real — samples, donations, supplier replacements — but a
      // zero cost silently makes the margin report say infinity.
      warn("unitCostCentavos", "Zero cost. Samples and donations are fine; a typo isn't.");
    }

    if (line.expiryDate === null) {
      warn(
        "expiryDate",
        "No expiry recorded. This batch will be dispensed last, after all dated stock.",
      );
    } else {
      const day = line.expiryDate.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
        err("expiryDate", "That isn't a date.");
      } else if (day < today) {
        // Refused, not warned. Expired stock cannot be dispensed, so receiving
        // it only puts a write-off on the shelf and hides a supplier problem.
        err("expiryDate", "That's already expired — don't accept the delivery.");
      } else if (day <= shortDatedCutoff) {
        warn("expiryDate", `Short-dated: expires within ${SHORT_DATED_DAYS} days.`);
      }
    }

    if (!line.lotNumber?.trim()) {
      // Warned rather than required: a box of gauze has no lot number. But a
      // recall names a lot, so a batch without one cannot be recalled by lot.
      warn("lotNumber", "No lot number. A recall names a lot, so this batch can't be traced.");
    }
  });

  return issues;
}

export function hasErrors(issues: LineIssue[]): boolean {
  return issues.some((i) => i.severity === "error");
}

export function issuesFor(issues: LineIssue[], index: number): LineIssue[] {
  return issues.filter((i) => i.index === index);
}

const manilaFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Manila",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function manilaDay(d: Date): string {
  return manilaFormatter.format(d);
}

function addDays(day: string, days: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
