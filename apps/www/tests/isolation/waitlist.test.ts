import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { joinWaitlistIn } from "@servd/db";

/**
 * The waitlist table, against a real database.
 *
 * This is the test the plan said would not be rushed. `anon` is the role behind
 * the Supabase key that ships in every browser, and `partner_waitlist` holds
 * names, email addresses and mobile numbers — the same shape as the
 * prospect_leads hole D27 found and closed.
 *
 * The brief asked for "anon can INSERT only". What is asserted here is
 * stronger: `anon` can do NOTHING. Every write goes through a server action, so
 * the browser needs no grant, and a grant nobody uses is a grant nobody
 * notices. If someone later adds an anon policy "so the form can post
 * directly", these assertions fail and say why.
 *
 * Skips without DATABASE_URL, like every DB-backed suite here.
 */
const hasDb = !!process.env.DATABASE_URL;
const d = hasDb ? describe : describe.skip;

const prisma = new PrismaClient();
const stamp = randomUUID().slice(0, 8);
const CITY = `Testville ${stamp}`;

function asSuper<T>(fn: (tx: any) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select set_config('app.is_super_admin', 'on', true)`;
    return fn(tx);
  }) as Promise<T>;
}

/**
 * The browser's role, with no scope GUC set — exactly what the anon key gets.
 *
 * `set_config('role', …)` rather than SET ROLE: the pooler recycles sessions,
 * and a transaction-local setting cannot leak into the next caller's queries.
 */
function asAnon<T>(fn: (tx: any) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `select set_config('role', CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')` +
        ` THEN 'anon' ELSE current_setting('role') END, true)`,
    );
    return fn(tx);
  }) as Promise<T>;
}

d("partner_waitlist isolation", () => {
  let firstId = "";

  beforeAll(async () => {
    const first = await asSuper((tx) =>
      joinWaitlistIn(tx, {
        fullName: `First ${stamp}`,
        email: `first-${stamp}@example.test`,
        mobile: "+639171234567",
        city: CITY,
        hoursPerWeek: "h10to20",
        soldBefore: true,
      }),
    );
    firstId = first.id;
  });

  afterAll(async () => {
    await asSuper((tx) =>
      tx.partnerWaitlist.deleteMany({ where: { city: { contains: stamp } } }),
    );
    await prisma.$disconnect();
  });

  it("anon cannot READ the applicants", async () => {
    const rows = await asAnon((tx) =>
      tx.partnerWaitlist.findMany({ where: { city: CITY } }),
    ).catch(() => []);
    // Either the policy returns nothing or the grant refuses outright. Both are
    // a pass; a row coming back is not.
    expect(rows).toHaveLength(0);
  });

  it("anon cannot read one applicant by primary key either", async () => {
    const row = await asAnon((tx) =>
      tx.partnerWaitlist.findUnique({ where: { id: firstId } }),
    ).catch(() => null);
    expect(row).toBeNull();
  });

  it("anon cannot INSERT — deliberately stronger than the brief asked for", async () => {
    const wrote = await asAnon(async (tx) => {
      await tx.partnerWaitlist.create({
        data: {
          fullName: `Anon ${stamp}`,
          email: `anon-${stamp}@example.test`,
          mobile: "+639179999999",
          city: CITY,
          hoursPerWeek: "under5",
          soldBefore: false,
        },
      });
      return true;
    }).catch(() => false);
    expect(wrote).toBe(false);

    const count = await asSuper((tx) =>
      tx.partnerWaitlist.count({ where: { email: `anon-${stamp}@example.test` } }),
    );
    expect(count).toBe(0);
  });

  it("anon cannot read the territory list either", async () => {
    const rows = await asAnon((tx) => tx.territory.findMany({ take: 1 })).catch(() => []);
    expect(rows).toHaveLength(0);
  });

  it("counts a position per city, in arrival order", async () => {
    const second = await asSuper((tx) =>
      joinWaitlistIn(tx, {
        fullName: `Second ${stamp}`,
        email: `second-${stamp}@example.test`,
        mobile: "+639171234568",
        city: CITY,
        hoursPerWeek: "under5",
        soldBefore: false,
      }),
    );
    expect(second.position).toBe(2);
    expect(second.alreadyOn).toBe(false);

    // A different city starts its own count — the number is per city, not
    // global, which is the whole reason it is worth showing someone.
    const elsewhere = await asSuper((tx) =>
      joinWaitlistIn(tx, {
        fullName: `Elsewhere ${stamp}`,
        email: `elsewhere-${stamp}@example.test`,
        mobile: "+639171234569",
        city: `Otherville ${stamp}`,
        hoursPerWeek: "h20plus",
        soldBefore: true,
      }),
    );
    expect(elsewhere.position).toBe(1);
  });

  it("a second application from the same person does not become a second row", async () => {
    const again = await asSuper((tx) =>
      joinWaitlistIn(tx, {
        fullName: `First ${stamp}`,
        // Same person, different capitalisation — one applicant, not two.
        email: `FIRST-${stamp}@example.test`,
        mobile: "+639171234567",
        city: CITY.toUpperCase(),
        hoursPerWeek: "h10to20",
        soldBefore: true,
      }),
    );
    expect(again.alreadyOn).toBe(true);
    expect(again.id).toBe(firstId);

    const count = await asSuper((tx) =>
      tx.partnerWaitlist.count({ where: { city: { equals: CITY, mode: "insensitive" } } }),
    );
    expect(count).toBe(2); // the first and the second applicant — not three
  });
});
