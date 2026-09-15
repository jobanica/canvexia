import { describe, it, expect } from "vitest";
import {
  LeadInput,
  ProspectInput,
  SOURCES,
  STAGES,
  STAGE_LABELS,
  firstMessage,
  isStage,
} from "@/lib/partners/prospect-input";

/**
 * The pipeline's two input shapes.
 *
 * The public one is the reason this file matters: it is the only place in the
 * partner portal where an unauthenticated stranger writes a row.
 */
const partnerForm = {
  businessName: "  Botica San Roque ",
  ownerName: "Aling Nena",
  mobile: "0917 123 4567",
  address: "Poblacion, Tagum",
  productId: "pharmacy",
  source: "walk_in",
  nextFollowUpAt: "2026-07-14",
  notes: "Wants to see the expiry tracking.",
  assignedToId: "",
};

const leadForm = {
  businessName: "Mango Grill",
  ownerName: "Jun",
  mobile: "+63 918 123 4567",
  address: "",
  productId: "servd",
  message: "Interested in QR ordering.",
};

describe("ProspectInput — a partner's own form", () => {
  it("accepts a filled form and normalises what it stores", () => {
    const r = ProspectInput.safeParse(partnerForm);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.businessName).toBe("Botica San Roque");
    expect(r.data.mobile).toBe("+639171234567");
    expect(r.data.nextFollowUpAt?.toISOString()).toBe("2026-07-14T00:00:00.000Z");
    // "" is not an answer — an empty box means "not set", and "" in the column
    // reads as an answer given.
    expect(r.data.assignedToId).toBeNull();
  });

  it("needs only a name and a product", () => {
    const r = ProspectInput.safeParse({ businessName: "Corner Store", productId: "servd" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.mobile).toBeNull();
  });

  it("accepts a prospect with no number — a shop you walked past", () => {
    const r = ProspectInput.safeParse({ ...partnerForm, mobile: "" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.mobile).toBeNull();
  });

  it("but refuses a number that is not a PH mobile", () => {
    const r = ProspectInput.safeParse({ ...partnerForm, mobile: "082 224 1234" });
    expect(r.success).toBe(false);
    if (!r.success) expect(firstMessage(r.error)).toMatch(/PH mobile/i);
  });

  it("refuses a product that is not in the registry", () => {
    // Not a free-text column: a typo here is a prospect nobody can convert,
    // because the adapter it names does not exist.
    const r = ProspectInput.safeParse({ ...partnerForm, productId: "pharmacyy" });
    expect(r.success).toBe(false);
    if (!r.success) expect(firstMessage(r.error)).toMatch(/not a product/i);
  });

  it("parses a follow-up date as UTC midnight, not local", () => {
    // `new Date("2026-07-14")` is UTC midnight; `new Date("2026/07/14")` is
    // local. Mixing them puts a follow-up a day out for half the year.
    const r = ProspectInput.safeParse({ ...partnerForm, nextFollowUpAt: "2026-01-01" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.nextFollowUpAt?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("caps a notes field somebody pastes a novel into", () => {
    expect(ProspectInput.safeParse({ ...partnerForm, notes: "x".repeat(5000) }).success).toBe(false);
  });
});

describe("LeadInput — the public form", () => {
  it("accepts a filled form", () => {
    const r = LeadInput.safeParse(leadForm);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.mobile).toBe("+639181234567");
  });

  it("REQUIRES a mobile, unlike the partner's own form", () => {
    // The partner has the shop in front of them; a stranger is asking to be
    // called back, and a lead with no way to reach them is not a lead.
    const r = LeadInput.safeParse({ ...leadForm, mobile: "" });
    expect(r.success).toBe(false);
    if (!r.success) expect(firstMessage(r.error)).toMatch(/call you back/i);
  });

  it("requires a name to ask for", () => {
    const r = LeadInput.safeParse({ ...leadForm, ownerName: "  " });
    expect(r.success).toBe(false);
    if (!r.success) expect(firstMessage(r.error)).toMatch(/ask for/i);
  });

  it("accepts NOTHING a partner-only field would set", () => {
    // The shape is the security boundary: stage, assignment, follow-up date and
    // the 2000-character notes field are absent, so a crafted POST cannot set
    // them. Everything extra is dropped rather than stored.
    const r = LeadInput.safeParse({
      ...leadForm,
      stage: "paid",
      assignedToId: "someone",
      nextFollowUpAt: "2026-01-01",
      notes: "x".repeat(2000),
      partnerId: "another-partner",
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    const keys = Object.keys(r.data).sort();
    expect(keys).toEqual(
      ["address", "businessName", "message", "mobile", "ownerName", "productId"].sort(),
    );
  });

  it("caps the public message far shorter than a partner's notes", () => {
    expect(LeadInput.safeParse({ ...leadForm, message: "x".repeat(501) }).success).toBe(false);
    expect(LeadInput.safeParse({ ...leadForm, message: "x".repeat(500) }).success).toBe(true);
  });
});

describe("the stage vocabulary", () => {
  it("matches the Prisma enum, in pipeline order", () => {
    expect([...STAGES]).toEqual(["lead", "contacted", "demo_booked", "trial", "paid", "lost"]);
    expect(Object.keys(STAGE_LABELS).sort()).toEqual([...STAGES].sort());
  });

  it("refuses a stage the database does not have", () => {
    for (const bad of ["won", "LEAD", "demo booked", ""]) expect(isStage(bad), bad).toBe(false);
  });

  it("offers exactly the sources the column accepts", () => {
    expect([...SOURCES]).toEqual(["walk_in", "referral", "lead_form", "ads", "other"]);
  });
});
