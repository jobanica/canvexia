import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { WriteoffInput, movementTypeFor, WRITEOFF_REASONS } from "@/lib/pharmacy/writeoff-input";
import { PrescriptionInput, ageInDays } from "@/lib/pharmacy/prescription-input";

/**
 * WAVE 3 — write-offs (including donations), prescriptions as records, and
 * stocktakes.
 *
 * Before this the ONLY way stock could go down was a sale. Expired batches sat
 * on the shelf in the system forever — excluded from what is sellable, never
 * actually removed — so the shelf and the screen drifted apart permanently, and
 * "what did we lose to expiry this year" had no answer at all.
 */

const src = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");

describe("writing stock off", () => {
  const base = {
    batchId: "11111111-1111-1111-1111-111111111111",
    quantity: "5",
    reason: "expired",
  };

  it("refuses a donation with no recipient", () => {
    // A donation with no recipient is indistinguishable from stock that
    // walked — which is what the word "donated" would then be hiding.
    expect(WriteoffInput.safeParse({ ...base, reason: "donated" }).success).toBe(false);
    expect(
      WriteoffInput.safeParse({ ...base, reason: "donated", recipient: "Barangay health centre" })
        .success,
    ).toBe(true);
  });

  it("does not demand a recipient for any other reason", () => {
    for (const reason of WRITEOFF_REASONS.filter((r) => r !== "donated")) {
      expect(WriteoffInput.safeParse({ ...base, reason }).success).toBe(true);
    }
  });

  it("refuses a zero or fractional quantity", () => {
    expect(WriteoffInput.safeParse({ ...base, quantity: "0" }).success).toBe(false);
    expect(WriteoffInput.safeParse({ ...base, quantity: "2.5" }).success).toBe(false);
  });

  it("records expiry under its own movement type and the rest as adjustments", () => {
    expect(movementTypeFor("expired")).toBe("expiry_writeoff");
    expect(movementTypeFor("donated")).toBe("adjustment");
    expect(movementTypeFor("damaged")).toBe("adjustment");
  });

  const server = src("server/pharmacy/writeoffs.ts");

  it("brings the batch down, writes the ledger and records the reason", () => {
    // Any two without the third is a stock level nobody can explain.
    expect(server).toContain("tx.pharmacyBatch.update");
    expect(server).toContain("tx.pharmacyWriteoff.create");
    expect(server).toContain("tx.pharmacyStockMovement.create");
  });

  it("signs the movement negative", () => {
    // The ledger is signed; a positive here makes the statement disagree with
    // the balance it is supposed to explain.
    expect(server).toContain("quantityDelta: -values.quantity");
  });

  it("refuses to write off more than the batch holds, rather than clamping", () => {
    // Clamping writes a record saying forty units left when thirty-one did.
    expect(server).toContain("if (values.quantity > batch.quantity)");
  });

  it("snapshots the product name onto the write-off", () => {
    expect(server).toContain("productName: batch.product.name");
  });

  it("scopes the batch lookup to this pharmacy", () => {
    expect(server).toContain("where: { id: values.batchId, pharmacyId }");
  });
});

describe("prescriptions as records", () => {
  const valid = {
    patientName: "Ana Reyes",
    doctorName: "Dr Santos",
    dateIssued: "2026-09-01",
  };

  it("requires a patient and a prescriber", () => {
    expect(PrescriptionInput.safeParse({ ...valid, patientName: " " }).success).toBe(false);
    expect(PrescriptionInput.safeParse({ ...valid, doctorName: "" }).success).toBe(false);
  });

  it("does NOT require a PRC number", () => {
    // It is often not legible on the paper, and refusing the record over it
    // means no record at all — strictly worse than an incomplete one.
    const r = PrescriptionInput.parse(valid);
    expect(r.doctorPrcNo).toBeNull();
  });

  it("files the date in Manila, not UTC", () => {
    // A prescription written on the 1st must not be filed under the 31st
    // because the server is in another hemisphere.
    const r = PrescriptionInput.parse(valid);
    expect(r.dateIssued.toISOString()).toBe("2026-08-31T16:00:00.000Z");
  });

  it("refuses a missing or malformed date", () => {
    expect(PrescriptionInput.safeParse({ ...valid, dateIssued: "" }).success).toBe(false);
    expect(PrescriptionInput.safeParse({ ...valid, dateIssued: "01/09/2026" }).success).toBe(false);
  });

  it("measures age in whole days", () => {
    const issued = new Date("2026-09-01T00:00:00+08:00");
    expect(ageInDays(issued, new Date("2026-09-01T10:00:00+08:00"))).toBe(0);
    expect(ageInDays(issued, new Date("2026-09-15T00:00:00+08:00"))).toBe(14);
  });

  it("does not add a second statutory gate", () => {
    // The rule that only a pharmacist may complete a cart containing an Rx
    // item lives in roles.ts and the sale path, where it already works. A
    // second copy here could disagree with the first.
    const server = src("server/pharmacy/prescriptions.ts");
    expect(server).not.toContain("dispenseRx");
  });

  it("checks a linked customer belongs to this pharmacy", () => {
    expect(src("server/pharmacy/prescriptions.ts")).toContain(
      "where: { id: values.customerId, pharmacyId }",
    );
  });
});

describe("stocktakes", () => {
  const server = src("server/pharmacy/stocktake.ts");

  it("snapshots the system quantity when the sheet opens", () => {
    // Reading it again at approval compares the count against a number that
    // moved while people were counting, and writes ordinary trading off as a
    // discrepancy.
    expect(server).toContain("systemQty: onHand(batches, now)");
  });

  it("opens a line for every active product, including ones believed empty", () => {
    // A sheet that only lists what the system thinks is there can never find
    // stock nobody recorded.
    expect(server).toContain('where: { pharmacyId: input.pharmacyId, isActive: true }');
  });

  it("leaves an uncounted line alone on approval", () => {
    // THE most destructive thing this screen could do is write every
    // untouched product down to nothing.
    expect(server).toContain("i.countedQty !== null && i.countedQty !== i.systemQty");
  });

  it("takes a shortfall off the soonest-expiring batches", () => {
    // If forty went missing, the ones that went are the ones at the front.
    expect(server).toContain('orderBy: [{ expiryDate: "asc" }, { receivedAt: "asc" }]');
  });

  it("puts a surplus into an undated batch, which is dispensed last", () => {
    expect(server).toContain("expiryDate: null");
    expect(server).toContain('reason: "Stocktake: counted over"');
  });

  it("refuses a second count while one is open", () => {
    // Two open sheets means two snapshots of the same shelf and two sets of
    // adjustments that each think they are the truth.
    expect(server).toContain('status: { in: ["draft", "counting"] }');
  });

  it("will not cancel an approved count", () => {
    // The stock has already moved; walking the status back leaves adjustments
    // with no document behind them.
    expect(server).toContain("Only a count in progress can be cancelled.");
  });

  it("writes every adjustment through the normal batch and movement rows", () => {
    expect(server).toContain("tx.pharmacyStockMovement.create");
    expect(server).toContain("tx.pharmacyBatch.create");
  });

  const actions = src("app/stocktake/actions.ts");

  it("submits a blank count box as null, never zero", () => {
    expect(actions).toContain('if (raw === "") return { itemId, countedQty: null };');
  });

  it("needs a higher permission to approve than to count", () => {
    // The person counting and the person signing off the variance should not
    // have to be the same.
    expect(actions).toContain('requireStaff("manageStock")');
    expect(actions).toContain('requireStaff("viewReports")');
  });
});

describe("the nav", () => {
  /**
   * The drawer became a PINNED SIDEBAR on desktop and a drawer on a phone when
   * the app was restyled, so these moved from NavDrawer to MobileNav and
   * SidebarNav. The rules are unchanged — they are about behaviour, not about
   * which file holds it.
   */
  const drawer = src("components/MobileNav.tsx");
  const sidebar = src("components/SidebarNav.tsx");
  const shell = src("components/AppShell.tsx");

  it("closes the phone drawer on a link tap, not only on a route change", () => {
    // Covers a link to the page you are already on: no route change, so
    // usePathname never fires and nothing else would close it.
    expect(drawer).toContain("useEffect(() => setOpen(false), [pathname]);");
    expect(drawer).toContain("onNavigate={() => setOpen(false)}");
  });

  it("locks the page behind the drawer", () => {
    expect(drawer).toContain('document.body.style.overflow = "hidden"');
  });

  it("never truncates the list", () => {
    // The links that would fall off are the newest ones — which are exactly
    // the ones nobody has found yet.
    expect(shell).not.toMatch(/NAV[^\n;]*\.slice\(/);
    expect(sidebar).not.toMatch(/links[^\n;]*\.slice\(/);
  });

  it("still filters by permission rather than disabling", () => {
    expect(shell).toContain("NAV.filter((n) => !n.needs || can(staff.role, n.needs))");
  });

  it("highlights the dashboard only on the dashboard", () => {
    // A prefix test on "/" matches every page in the app, lights up two items
    // at once, and teaches people the highlight means nothing.
    expect(sidebar).toContain('l.href === "/" ? pathname === "/" : pathname.startsWith(l.href)');
  });
});
