import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A7.3: the staff record, and the one action in it that must not half-happen.
 *
 * Offboarding is three things — deactivate, hand the book over, revoke the
 * session — and every pair of them without the third is a worse state than
 * doing nothing:
 *
 *   deactivated, book not moved  → those merchants have nobody
 *   book moved, not deactivated  → somebody who left can still sign in
 *   both, session not revoked    → an open tab keeps working
 *
 * These are source-level assertions rather than a live run, for the same reason
 * the impersonation drift guard is: what breaks this is somebody editing the
 * action later and dropping a step, and no type error would say so.
 */
const read = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");

/**
 * The file with its comments removed.
 *
 * The same lesson the impersonation drift guard learned: a doc comment that
 * says "404, not 403" is not a 403, and an assertion that scans raw source
 * fails on the explanation rather than on the behaviour.
 */
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("offboarding", () => {
  const src = read("server/partners/staff-actions.ts");

  it("moves merchants on BOTH tables, and the prospects", () => {
    // D29: two merchant tables. Moving only restaurants leaves a pharmacy
    // assigned to somebody who no longer works there, and nothing would say so
    // until a statement or a scorecard came out wrong.
    const body = src.slice(src.indexOf("export async function offboardStaffAction"));
    for (const call of [
      "tx.restaurant.updateMany",
      "tx.pharmacy.updateMany",
      "tx.prospect.updateMany",
    ]) {
      expect(body, call).toContain(call);
    }
    // Both directions of assignment, not just sales.
    expect(body).toContain("assignedSalesUserId: staffId");
    expect(body).toContain("assignedSupportUserId: staffId");
  });

  it("deactivates in the SAME transaction as the handover", () => {
    const body = src.slice(
      src.indexOf("export async function offboardStaffAction"),
      src.indexOf("// --- outside the transaction"),
    );
    expect(body).toContain("await systemDb(async (tx) =>");
    expect(body).toContain('status: "deactivated"');
    // And the audit row is inside it too, or a rolled-back offboarding leaves a
    // log entry claiming it happened.
    expect(body).toContain("partner.staff_offboarded");
  });

  it("revokes the session OUTSIDE the transaction, and records a failure", () => {
    // Deliberate: the handover must not roll back because Supabase was briefly
    // unreachable, which would leave the person fully active. A failure to sign
    // them out is written down instead of swallowed.
    const tail = src.slice(src.indexOf("// --- outside the transaction"));
    expect(tail).toContain("auth.admin.signOut");
    expect(tail).toContain("partner.staff_session_revoke_failed");
  });

  it("refuses to offboard yourself or the last admin", () => {
    // Both would leave nobody able to undo it from inside the portal.
    expect(src).toContain("staffId === who.userId");
    expect(src).toContain("This is your last admin");
  });

  it("refuses an ops_manager acting on an admin seat", () => {
    // The brief's "✓ (not admins)". An ops manager who could offboard an admin
    // could remove every person able to stop them.
    expect(src).toContain("canManageSeatRole(who.partner.user.role, target.role)");
  });

  it("does not reassign the book on reactivation", () => {
    // The work went to somebody else. Taking it back silently surprises two
    // people at once.
    const body = src.slice(src.indexOf("export async function reactivateStaffAction"));
    expect(body).not.toContain("assignedSalesUserId");
    expect(body).not.toContain("assignedToId");
  });
});

describe("the emergency contact", () => {
  it("is withheld at the SELECT, not hidden in the markup", () => {
    // A value that reaches the server component is in the serialised props.
    const staff = read("server/partners/staff.ts");
    expect(staff).toContain("emergencyName: opts.includeEmergency");
    expect(staff).toContain("emergencyMobile: opts.includeEmergency");
  });

  it("is only requested for a reader holding hr.view_all", () => {
    const page = read("app/(platform)/partner/team/staff/[id]/page.tsx");
    expect(page).toContain("includeEmergency: seesEveryone");
    expect(page).toContain('partnerAllows(partner, "hr.view_all")');
  });

  it("is never written into an audit row", () => {
    // The log is read by more people than the record is.
    const src = read("server/partners/staff-actions.ts");
    const audit = src.slice(src.indexOf("partner.staff_updated"));
    const afterClause = audit.slice(audit.indexOf("after:"), audit.indexOf("});"));
    expect(afterClause).not.toContain("emergency");
  });

  it("is never in the CSV export", () => {
    // That file gets emailed around.
    const route = read("app/api/partner/staff/[id]/activity.csv/route.ts");
    expect(route).toContain("includeEmergency: false");
  });
});

describe("the CSV route re-checks what the page checks", () => {
  const route = read("app/api/partner/staff/[id]/activity.csv/route.ts");

  it("checks the permission AND whose record it is", () => {
    // The id in the path is exactly the part somebody would change.
    expect(route).toContain("partner.user.id === id");
    expect(route).toContain('partner.permissions.has("hr.view_all")');
  });

  it("answers 404 rather than 403", () => {
    // Whether a staff id exists inside another partner is not something this
    // endpoint should confirm.
    expect(route).toContain('new Response("Not found", { status: 404 })');
    expect(code("app/api/partner/staff/[id]/activity.csv/route.ts")).not.toContain("403");
  });

  it("writes ISO timestamps, which sort", () => {
    // The first thing anybody does with an export is sort it in Excel, where
    // "Sep 3" comes before "Sep 20".
    expect(route).toContain("r.at.toISOString()");
  });
});
