import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { branchWhere, type BranchContext, type BranchRow } from "@/server/pharmacy/branches";

/**
 * WAVE 6 — branches, and transfers between them.
 *
 * The invasive one, done additively: `branchId` is nullable everywhere and
 * every pre-branch row was backfilled to a Main Branch. A NULL IS READ AS THE
 * MAIN BRANCH rather than "no branch", so a row written by a path that has not
 * been taught about branches lands somewhere real instead of vanishing from
 * every per-branch total.
 */

const src = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");

const branch = (over: Partial<BranchRow> = {}): BranchRow => ({
  id: "b-main",
  name: "Main Branch",
  address: null,
  phone: null,
  isMain: true,
  isActive: true,
  ...over,
});

const ctx = (over: Partial<BranchContext> = {}): BranchContext => ({
  branches: [branch()],
  current: branch(),
  all: false,
  writeBranchId: "b-main",
  multi: false,
  ...over,
});

describe("a null branch belongs to the main branch", () => {
  it("includes null rows when the main branch is selected", () => {
    // Without this, stock written before branches existed — or by any path not
    // yet taught about them — disappears from the only branch most pharmacies
    // will ever have.
    expect(branchWhere(ctx())).toEqual({
      OR: [{ branchId: "b-main" }, { branchId: null }],
    });
  });

  it("does NOT include null rows at a secondary branch", () => {
    // A null means "main", so sweeping it into a second branch would show that
    // branch stock it does not have.
    const second = branch({ id: "b-2", name: "Toril", isMain: false });
    expect(branchWhere(ctx({ current: second }))).toEqual({ branchId: "b-2" });
  });

  it("filters nothing when every branch is selected", () => {
    expect(branchWhere(ctx({ all: true, current: null }))).toEqual({});
  });
});

describe("all-branches is a reading position, not a writing one", () => {
  const branches = src("server/pharmacy/branches.ts");

  it("still resolves a branch to write to", () => {
    // Stock has to land somewhere. A write made while "All branches" is
    // selected files at the main branch rather than at null-nowhere.
    expect(branches).toContain("writeBranchId: main?.id ?? null");
  });

  it("falls back to the main branch for an unrecognised cookie", () => {
    // A hand-set cookie, or one naming a deleted branch, must not blank the
    // screen.
    expect(branches).toContain("active.find((b) => b.id === chosen) ?? main");
  });

  it("refuses to close the main branch", () => {
    // It is where null-branch rows resolve and where every write falls back.
    expect(branches).toContain("The main branch cannot be closed.");
  });

  it("never creates a second main branch", () => {
    expect(branches).toContain("isMain: false,");
  });
});

describe("the switcher", () => {
  const route = src("app/api/branch/route.ts");
  const switcher = src("components/BranchSwitcher.tsx");

  it("validates the value against this pharmacy's own branches", () => {
    // So a hand-set cookie cannot name another pharmacy's branch.
    expect(route).toContain("branches.some((b) => b.id === value && b.isActive)");
  });

  it("refuses an absolute redirect target", () => {
    // `back` comes from the page; an absolute URL here is an open redirect.
    expect(route).toContain('back.startsWith("/") && !back.startsWith("//")');
  });

  it("keeps the selection in a cookie rather than the URL", () => {
    // The selection belongs to the person at the till, not the page they are
    // on — in the URL, every link that forgets it switches them back.
    expect(route).toContain("res.cookies.set(BRANCH_COOKIE");
    expect(switcher).toContain('action="/api/branch" method="post"');
  });

  it("renders nothing for a single-branch pharmacy", () => {
    // A dropdown with one option teaches people to ignore dropdowns.
    expect(switcher).toContain("if (branches.length < 2) return null;");
  });
});

describe("transfers", () => {
  const transfers = src("server/pharmacy/transfers.ts");

  it("takes stock off the source when it is sent", () => {
    expect(transfers).toContain("data: { quantity: { decrement: line.quantity } }");
    expect(transfers).toContain('reason: "Transferred out"');
  });

  it("does not put it on the destination until somebody confirms", () => {
    // The boxes are in a van. A one-step transfer makes stock teleport and
    // hides a shortfall at either end until a stocktake.
    expect(transfers).toContain('status: "in_transit"');
    expect(transfers).toContain("export async function receiveTransfer");
  });

  it("carries the lot number and expiry onto the line", () => {
    // Copied, not just referenced: the source batch may be emptied and tidied
    // away, and the goods still have a lot number. Losing it turns traceable
    // stock into anonymous stock at the branch boundary.
    expect(transfers).toContain("lotNumber: batch.lotNumber");
    expect(transfers).toContain("expiryDate: batch.expiryDate");
  });

  it("creates a NEW batch at the destination rather than moving the old row", () => {
    // The source batch records a delivery to that branch; rewriting its branch
    // would rewrite history at both ends.
    expect(transfers).toContain("const batch = await tx.pharmacyBatch.create({");
    expect(transfers).toContain("branchId: transfer.toBranchId");
  });

  it("refuses a branch transferring to itself", () => {
    // It would take stock out of a branch and put it straight back.
    expect(transfers).toContain("Pick two different branches.");
  });

  it("refuses to send more than the batch holds, rather than clamping", () => {
    expect(transfers).toContain("if (line.quantity > batch.quantity)");
  });

  it("will not receive or cancel one twice", () => {
    expect(transfers).toContain('if (transfer.status !== "in_transit")');
    expect(transfers).toContain("Send it back as a new transfer.");
  });

  it("puts stock back at the SOURCE when cancelled", () => {
    expect(transfers).toContain("branchId: transfer.fromBranchId");
    expect(transfers).toContain('reason: "Transfer cancelled, stock returned"');
  });
});

describe("writes land at a real branch", () => {
  it("stamps the sale and its movements from the server, not the form", () => {
    // A branch id in a request body is one somebody can change, and a sale
    // filed at the wrong branch takes its stock movement with it.
    const sale = src("server/pharmacy/sale.ts");
    expect(sale).toContain("branchId: req.branchId ?? openShift?.branchId ?? null,");
    const actions = src("app/receiving/actions.ts");
    expect(actions).toContain("branchId: branch.writeBranchId,");
    expect(actions).not.toMatch(/formData\.get\("branchId"\)/);
  });

  it("takes a write-off's branch from the batch it came off", () => {
    // The stock left the shelf it was actually on, whichever branch the person
    // recording it happens to be looking at.
    expect(src("server/pharmacy/writeoffs.ts")).toContain("branchId: batch.branchId,");
  });

  it("opens a till at the session's branch", () => {
    expect(src("app/shift/actions.ts")).toContain("branchId: branch.writeBranchId,");
  });
});

describe("the figures say which branch they cover", () => {
  it("names the branch on the dashboard when there is more than one", () => {
    // A figure that silently covers one branch of three is a figure somebody
    // will quote in a meeting.
    const page = src("app/page.tsx");
    expect(page).toContain("branch.multi &&");
    expect(page).toContain('branch.all ? "All branches" : branch.current?.name');
  });

  it("passes the branch into every money read", () => {
    const page = src("app/page.tsx");
    expect(page).toContain("salesReport(staff.pharmacyId, range, branch)");
    expect(page).toContain("inventoryValuation(staff.pharmacyId, new Date(), branch)");
  });
});
