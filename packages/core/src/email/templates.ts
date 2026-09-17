/**
 * Transactional email copy, as pure functions.
 *
 * WHY HALF THE EMAIL STACK LIVES HERE AND HALF DOES NOT. The brief asked to
 * move "the Resend client and base email template" into this package. The
 * template belongs here — it is copy and string building, a second app will
 * want it, and `packages/core` has zero dependencies precisely so that things
 * like this can live in it.
 *
 * The CLIENT cannot follow it. Loading the credentials reads
 * `platform_settings` through Prisma under a tenancy wrapper and is
 * `server-only`; moving that here would drag Prisma and the scope wrappers into
 * a package whose whole value is having neither. So the fetch and the
 * credential load stay in `apps/servd/src/server/email`, and this file is what
 * both of them render.
 *
 * Everything returns PLAIN TEXT paragraphs. The HTML is the sender's business —
 * `renderAccountEmail` in the app wraps these — which keeps this file free of
 * escaping rules and free of a second place for markup to go wrong.
 */

export interface PartnerInviteCopy {
  /** The brand the invitation is from, as the recipient knows it. */
  partnerName: string;
  /** Who sent it. A name if we have one, otherwise their email. */
  invitedBy: string;
  /** "admin" | "ops_manager" | "sales" | "support". */
  role: string;
  /** Absolute. Composed by the sender from the invite row. */
  acceptUrl: string;
  expiresAt: Date;
}

/**
 * One line per role, in the second person.
 *
 * The recipient has usually been told "I'm adding you to the system" and
 * nothing else. A role name on its own — "ops_manager" — tells them nothing;
 * this is the sentence that says what they will be able to do.
 *
 * Deliberately describes the DEFAULTS. A partner who has edited the permission
 * grid can make any of these wrong, and saying "your access may differ" in an
 * invitation would be both true and useless. The portal is the authority; this
 * is an introduction.
 */
export const ROLE_BLURB: Record<string, string> = {
  admin: "Full access, including revenue, pricing, the brand and the team.",
  ops_manager:
    "Running the team and the merchant book — no revenue figures and no billing.",
  sales: "Working the pipeline and opening merchant accounts.",
  support: "Looking after merchants that already exist.",
};

export const ROLE_TITLE: Record<string, string> = {
  admin: "Admin",
  ops_manager: "Ops manager",
  sales: "Sales",
  support: "Support",
};

/**
 * "15 September 2026" — Manila, spelled out, because 09/10 is ambiguous.
 *
 * ASSEMBLED FROM PARTS rather than handed to `toLocaleDateString`. The obvious
 * one-liner returns whatever the runtime's ICU data says a locale looks like —
 * `en-PH` renders "September 30, 2026" on Node — so the format would depend on
 * which machine sent the email. The parts are what this function actually
 * cares about; the order is this file's decision, not the platform's.
 *
 * The TIME ZONE still comes from Intl, because that is a real calculation: a
 * date at 16:00 UTC is already the next day in Manila.
 */
export function inviteExpiryLabel(at: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Manila",
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")} ${get("month")} ${get("year")}`;
}

/**
 * The staff invitation.
 *
 * SENT FROM CANVEXIA, WITH THE PARTNER'S NAME IN THE SUBJECT. There is no
 * per-partner verified sending domain — that would mean verifying each
 * operator's domain in Resend and storing per-partner credentials — so the
 * partner's brand goes where the recipient actually reads it rather than in a
 * from-address we cannot honestly sign.
 *
 * The subject leads with the partner rather than with CANVEXIA because that is
 * the name the recipient recognises: they were hired by the operator, and most
 * of them have never heard of CANVEXIA.
 */
export function partnerInviteEmail(c: PartnerInviteCopy): {
  subject: string;
  paragraphs: string[];
} {
  const title = ROLE_TITLE[c.role] ?? c.role;
  const blurb = ROLE_BLURB[c.role] ?? "";

  return {
    subject: `${c.partnerName} has invited you to CANVEXIA`,
    paragraphs: [
      `${c.invitedBy} has invited you to join ${c.partnerName} on CANVEXIA as ${
        /^[aeiou]/i.test(title) ? "an" : "a"
      } ${title}.`,
      blurb,
      `Set your password and you are in: ${c.acceptUrl}`,
      // The date, not "in 14 days" — a relative window is wrong the moment the
      // email sits in a queue or a spam folder for a day.
      `This link works until ${inviteExpiryLabel(c.expiresAt)}, and only once. ` +
        `If it expires, ask ${c.invitedBy} to send another.`,
      `If you were not expecting this, you can ignore it — nothing happens until you use the link.`,
    ].filter(Boolean),
  };
}

export interface PartnerStatementCopy {
  partnerName: string;
  /** "2026-09" */
  month: string;
  /** Centavos the partner owes CANVEXIA — their statement's hq share. */
  amountCentavos: number;
  merchantCount: number;
  dueAt: Date;
  /** Where they can see the same figure broken down. */
  statementUrl: string;
}

const MONTH_LABEL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2026-09" -> "September 2026". Never a locale call: the month key is not a date. */
function monthLabel(month: string): string {
  const [y, m] = month.split("-");
  const i = Number(m) - 1;
  return MONTH_LABEL[i] ? `${MONTH_LABEL[i]} ${y}` : month;
}

function pesos(centavos: number): string {
  return `₱${(centavos / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * HQ's monthly invoice to a partner.
 *
 * WHAT IT IS NOT: a request for a payout. Servd pays partners nothing. The
 * partner collected from their merchants and owes CANVEXIA its share of what
 * they collected, which is the opposite direction to what "statement" meant in
 * the commission era and is worth saying in the first line rather than leaving
 * somebody to infer from a number.
 *
 * The DATE is absolute, for the same reason the invite's expiry is: an email
 * that sits in a spam folder for three days makes "within 7 days" a lie.
 */
export function partnerStatementEmail(c: PartnerStatementCopy): {
  subject: string;
  paragraphs: string[];
} {
  const due = c.dueAt.toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return {
    subject: `${monthLabel(c.month)} — ${pesos(c.amountCentavos)} due to CANVEXIA`,
    paragraphs: [
      `Hello ${c.partnerName},`,
      `Your ${monthLabel(c.month)} statement is ready. You collected from ${c.merchantCount} ` +
        `merchant${c.merchantCount === 1 ? "" : "s"} last month, and CANVEXIA's share of that ` +
        `is ${pesos(c.amountCentavos)}.`,
      `Please settle by ${due}.`,
      `The same figure, broken down merchant by merchant, is in your portal: ${c.statementUrl}`,
      `If a number here does not match what you collected, reply to this email before you pay ` +
        `rather than after — a corrected statement is easy, a refund is not.`,
    ],
  };
}
