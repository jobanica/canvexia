import type { Prisma, WaitlistHours } from "@prisma/client";

/**
 * Joining the city-partner waitlist.
 *
 * Lives here rather than in apps/www for the reason D36 settled: the write
 * belongs to whoever owns the schema, so a second caller — the partner portal
 * adding someone who applied over Messenger — calls one implementation instead
 * of growing a second. Takes a transaction client and never opens its own; the
 * client belongs to the app that owns the process.
 *
 * `partner_waitlist` is locked to the super-admin context, so the caller's
 * wrapper must be a system scope. There is no `anon` grant on this table and
 * deliberately none: the brief's "anon can INSERT only" would put INSERT on a
 * table of names, emails and mobile numbers into every browser, which is the
 * shape of the hole D27 found on prospect_leads.
 */

export type WaitlistSource = "www" | "messenger";

export type JoinWaitlistInput = {
  fullName: string;
  email: string;
  /** Already normalised to +639XXXXXXXXX by the caller's schema. */
  mobile: string;
  city: string;
  province?: string | null;
  currentWork?: string | null;
  hoursPerWeek: WaitlistHours;
  soldBefore: boolean;
  soldWhat?: string | null;
  howHeard?: string | null;
  source?: WaitlistSource;
};

export type JoinWaitlistResult = {
  id: string;
  /** The city as it was typed, trimmed. */
  city: string;
  /** 1-based, among everyone who named this city. */
  position: number;
  /** True when this person was already on the list and no row was written. */
  alreadyOn: boolean;
};

/**
 * How many people have named this city, counted the way a person means it.
 *
 * `city` is free text — "Tagum", "tagum" and "Tagum City" are one place to the
 * applicant — so the count folds case. It does not try to fold "Tagum City"
 * onto "Tagum": guessing which words are part of a name is how a city finder
 * starts merging Santa Rosa, Laguna into Santa Rosa, Nueva Ecija. HQ maps the
 * free text onto a territory later; the number here is a courtesy, not a
 * ledger.
 */
async function positionInCity(
  tx: Prisma.TransactionClient,
  city: string,
  createdAt: Date,
): Promise<number> {
  return tx.partnerWaitlist.count({
    where: {
      city: { equals: city, mode: "insensitive" },
      // At or before, so the count includes this row and the answer is 1-based
      // without an off-by-one to remember. Two rows written in the same
      // millisecond both read as the same position — which is a nicety told to
      // two people, not a record anyone acts on.
      createdAt: { lte: createdAt },
    },
  });
}

export async function joinWaitlistIn(
  tx: Prisma.TransactionClient,
  input: JoinWaitlistInput,
): Promise<JoinWaitlistResult> {
  const city = input.city.trim();
  const email = input.email.trim();

  // Somebody presses the button twice, or comes back a week later having
  // forgotten. A second row makes one person look like two on the only number
  // this table produces. No unique index, because the same person applying for
  // a DIFFERENT city is a real and separate application.
  const existing = await tx.partnerWaitlist.findFirst({
    where: {
      email: { equals: email, mode: "insensitive" },
      city: { equals: city, mode: "insensitive" },
    },
    select: { id: true, city: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  if (existing) {
    return {
      id: existing.id,
      city: existing.city,
      position: await positionInCity(tx, existing.city, existing.createdAt),
      alreadyOn: true,
    };
  }

  const row = await tx.partnerWaitlist.create({
    data: {
      fullName: input.fullName.trim(),
      email,
      mobile: input.mobile.trim(),
      city,
      province: input.province?.trim() || null,
      currentWork: input.currentWork?.trim() || null,
      hoursPerWeek: input.hoursPerWeek,
      soldBefore: input.soldBefore,
      soldWhat: input.soldWhat?.trim() || null,
      howHeard: input.howHeard?.trim() || null,
      source: input.source ?? "www",
    },
    select: { id: true, city: true, createdAt: true },
  });

  return {
    id: row.id,
    city: row.city,
    position: await positionInCity(tx, row.city, row.createdAt),
    alreadyOn: false,
  };
}
