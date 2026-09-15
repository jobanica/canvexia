import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { composeDigest, type DigestFacts } from "@servd/db";
import { NOTIFICATION_EVENTS, NOTIFICATION_LABELS, isNotificationEvent } from "@servd/core";

/**
 * A7.7: four new events, and the one rule that matters about who gets them.
 *
 * The digest's manager section carries a list of who did not turn up. Mailing
 * that to the whole team would be the permission grid leaking out through an
 * email, so the composer takes it as an optional fact and the caller builds two
 * digests when a partner has both kinds of reader.
 */

const empty: DigestFacts = {
  partnerName: "Davao Operator",
  followUpsDue: [],
  attention: [],
  newTrials: [],
  newPayments: [],
  milestone: null,
};

describe("the new events", () => {
  it("adds the four A7 keys with labels", () => {
    for (const e of ["visit.logged", "checkin.missed", "target.at_risk", "commission.ready"]) {
      expect(isNotificationEvent(e), e).toBe(true);
      expect(NOTIFICATION_LABELS[e as never], e).toBeTruthy();
    }
    expect(NOTIFICATION_EVENTS).toHaveLength(12);
  });
});

describe("the digest's manager section", () => {
  it("is absent when no team facts are given", () => {
    // A salesperson's copy. Silence, not an empty section.
    const d = composeDigest({ ...empty, newTrials: ["Aling Nena"] });
    expect(d.body).not.toContain("Your team yesterday");
  });

  it("names who did not check in, and counts them as urgent", () => {
    const d = composeDigest({
      ...empty,
      team: [
        { name: "Ana", checkedIn: false, visits: 0, flagged: 0 },
        { name: "Bea", checkedIn: true, visits: 3, flagged: 0 },
      ],
    });
    expect(d.worthSending).toBe(true);
    expect(d.body).toContain("No check-in: Ana");
    expect(d.body).toContain("Bea: 3 visits");
    // One person missing plus nothing else is still "1 thing needs you today".
    expect(d.subject).toBe("1 thing needs you today");
  });

  it("says nothing on a quiet day when everybody turned up and did nothing", () => {
    // A section that appears every morning saying "5 people, 0 visits" on a
    // Sunday is the line that teaches people to stop opening this.
    const d = composeDigest({
      ...empty,
      team: [
        { name: "Ana", checkedIn: true, visits: 0, flagged: 0 },
        { name: "Bea", checkedIn: true, visits: 0, flagged: 0 },
      ],
    });
    expect(d.worthSending).toBe(false);
  });

  it("flags visits logged far from the address", () => {
    const d = composeDigest({
      ...empty,
      team: [{ name: "Ana", checkedIn: true, visits: 4, flagged: 2 }],
    });
    expect(d.body).toContain("far from the address on file: Ana (2)");
  });

  it("agrees with itself about worthSending whichever facts it is given", () => {
    // The composer is one function on purpose. Two of them would eventually
    // disagree about whether a morning was worth an email.
    const withTeam = composeDigest({
      ...empty,
      team: [{ name: "Ana", checkedIn: true, visits: 0, flagged: 0 }],
    });
    expect(withTeam.worthSending).toBe(composeDigest(empty).worthSending);
  });
});

const read = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");

/**
 * Comments stripped.
 *
 * The third time this file's kind of assertion has tripped on an explanation
 * rather than on behaviour: `managerSeats` explains at length why it does NOT
 * key on `hr.view_all`, and a raw-source scan reads that as using it.
 */
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("who gets what", () => {
  it("builds TWO digests when a partner has managers and field staff", () => {
    // A salesperson's copy must not carry a list of who else did not check in.
    const src = read("server/partners/digest.ts");
    expect(src).toContain("const managerRoles = new Set([\"admin\", \"ops_manager\"])");
    expect(src).toContain("includeTeam: true");
  });

  it("resolves the manager audience by ROLE, not by an editable permission", () => {
    // hr.view_all can be granted to salespeople for a shared scorecard. If the
    // audience were keyed on it, that grant would start mailing every
    // salesperson a list of who did not turn up.
    expect(read("server/partners/notify.ts")).toContain(
      'role: { in: ["admin", "ops_manager"] }',
    );
    expect(code("server/partners/notify.ts")).not.toContain("hr.view_all");
  });

  it("treats a missing preference row as YES", () => {
    const notify = read("server/partners/notify.ts");
    expect(notify).toContain("const off = new Set(prefs.filter((p) => !p.email)");
  });

  it("never fails the work it is notifying about", () => {
    // Every caller is mid-way through something that matters more.
    const notify = read("server/partners/notify.ts");
    expect(notify).toContain("} catch {\n    return 0;\n  }");
  });
});

describe("the timing rules", () => {
  it("sends one missed-check-in notice per partner, not one per person", () => {
    // Five emails at 10am is how a manager builds a filter rule, and then the
    // day somebody really is missing they do not see that either.
    const src = read("server/partners/attendance-actions.ts");
    const fn = src.slice(src.indexOf("export async function notifyMissedCheckIns"));
    expect(fn).toContain('event: "checkin.missed"');
    expect(fn).toContain("subject: `${missing.length} not checked in`");
  });

  it("expects only the field roles to check in", () => {
    // A partner whose admin never works the field should not be reported absent
    // every morning — that is the notice that teaches people to ignore this one.
    const src = read("server/partners/attendance-actions.ts");
    const fn = src.slice(src.indexOf("export async function notifyMissedCheckIns"));
    expect(fn).toContain('role: { in: ["sales", "support"] }');
  });

  it("warns about targets on the 15th only, and paces against the month", () => {
    const src = read("server/partners/scorecard.ts");
    const fn = src.slice(src.indexOf("export async function notifyTargetsAtRisk"));
    expect(fn).toContain("if (day !== 15) return 0;");
    // Comparing to the FULL target on the 15th would flag everybody every time,
    // which is the same as flagging nobody.
    expect(fn).toContain("const elapsed = day / daysInMonth;");
  });

  it("does not email a commission statement worth nothing", () => {
    // "Your statement is ready: ₱0" makes somebody open the portal to find out
    // they earned nothing, which is worse than the silence.
    const src = read("server/partners/commissions.ts");
    expect(src).toContain("if (result.totalCentavos > 0)");
  });
});

describe("the round-robin", () => {
  const src = read("server/partners/lead-form.ts");

  it("picks the sales seat that has waited longest", () => {
    // Not a counter — it needs a row to lock and drifts when somebody is
    // deactivated — and not random, which gives one person four in a row often
    // enough to be resented.
    expect(src).toContain("nextLeadOwner");
    expect(src).toContain('role: "sales"');
    expect(src).toContain("_max: { createdAt: true }");
  });

  it("puts a seat that has never had one first", () => {
    expect(src).toContain("lastFor.get(seat.id) ?? 0");
  });

  it("falls back to the default user, then to nobody", () => {
    // Null is a real answer: an unassigned prospect is visible in the pipeline,
    // where a lead filed against an admin who never looks at it is not.
    expect(src).toContain("defaultLeadUserId");
    expect(src).toContain("return null;");
  });
});
