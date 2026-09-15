import { NOTIFICATION_EVENTS, type NotificationEvent } from "@servd/core";

/**
 * The daily digest's CONTENT, composed from a bundle of facts.
 *
 * Pure on purpose. The interesting decisions here are what to include, what to
 * leave out and when to send nothing at all — and none of them need a database
 * to be argued about or tested. Fetching the facts and sending the mail are the
 * caller's job.
 *
 * SENDING IS NOT WIRED. Resend reads its API key from
 * `platform_settings.emailCredsEnc`, decrypted with
 * `CREDENTIALS_ENCRYPTION_KEY`, which is unset on every deployment. A digest
 * that silently no-ops is worse than none, because the partner believes they
 * are being told. This composes; A-something-later sends.
 */
export interface DigestFacts {
  partnerName: string;
  /** Prospects whose follow-up is due today or overdue. */
  followUpsDue: { businessName: string; overdueDays: number }[];
  /** Merchants needing attention, already summarised by the caller. */
  attention: { title: string; detail: string }[];
  /** Yesterday, in Manila. */
  newTrials: string[];
  newPayments: { merchant: string; amountCentavos: number }[];
  /** Null when the partner has no ladder or no licence start. */
  milestone: { target: number; actual: number; month: number; atRisk: boolean } | null;

  /**
   * A7: yesterday's field work, for a reader who manages the team.
   *
   * ABSENT for a salesperson's own digest, and present for a manager's. The two
   * are the same composer with different facts rather than two composers: the
   * decision about what is worth an email at all — `worthSending` — must not be
   * made twice and come out differently.
   */
  team?: {
    name: string;
    checkedIn: boolean;
    visits: number;
    /** Visits logged far from the address on file. */
    flagged: number;
  }[];
}

export interface Digest {
  subject: string;
  /** Plain text. The HTML version is the sender's business, not this module's. */
  body: string;
  /** False when there is nothing worth an email. */
  worthSending: boolean;
}

const peso = (c: number) => `PHP ${Math.round(c / 100).toLocaleString("en-PH")}`;

/**
 * Compose one partner's digest.
 *
 * `worthSending` is the point of this function. A daily email that arrives every
 * day saying "nothing happened" is an email people filter, and then the one that
 * matters is filtered too. Silence is a feature.
 */
export function composeDigest(facts: DigestFacts): Digest {
  const sections: string[] = [];

  if (facts.followUpsDue.length > 0) {
    const lines = facts.followUpsDue.map((f) =>
      f.overdueDays > 0
        ? `  - ${f.businessName} (${f.overdueDays} day${f.overdueDays === 1 ? "" : "s"} overdue)`
        : `  - ${f.businessName}`,
    );
    sections.push(`Follow up today (${facts.followUpsDue.length}):\n${lines.join("\n")}`);
  }

  if (facts.attention.length > 0) {
    const lines = facts.attention.map((a) => `  - ${a.title}: ${a.detail}`);
    sections.push(`Needs you (${facts.attention.length}):\n${lines.join("\n")}`);
  }

  if (facts.newTrials.length > 0) {
    sections.push(
      `New trials yesterday (${facts.newTrials.length}):\n` +
        facts.newTrials.map((t) => `  - ${t}`).join("\n"),
    );
  }

  if (facts.newPayments.length > 0) {
    const total = facts.newPayments.reduce((s, p) => s + p.amountCentavos, 0);
    sections.push(
      `Payments yesterday (${peso(total)}):\n` +
        facts.newPayments.map((p) => `  - ${p.merchant}: ${peso(p.amountCentavos)}`).join("\n"),
    );
  }

  // The manager's section. Sorted by what is wrong rather than alphabetically:
  // a list of twelve people read every morning is a list nobody reads, and the
  // two who did not check in are the only reason to open it.
  if (facts.team && facts.team.length > 0) {
    const missing = facts.team.filter((t) => !t.checkedIn);
    const flagged = facts.team.filter((t) => t.flagged > 0);
    const visits = facts.team.reduce((n, t) => n + t.visits, 0);

    const lines: string[] = [];
    if (missing.length > 0) {
      lines.push(`  - No check-in: ${missing.map((t) => t.name).join(", ")}`);
    }
    if (flagged.length > 0) {
      lines.push(
        `  - Visit far from the address on file: ${flagged
          .map((t) => `${t.name} (${t.flagged})`)
          .join(", ")}`,
      );
    }
    for (const t of facts.team.filter((t) => t.checkedIn && t.visits > 0)) {
      lines.push(`  - ${t.name}: ${t.visits} visit${t.visits === 1 ? "" : "s"}`);
    }

    // Only when there is something to say. A team section that appears every
    // morning saying "5 people, 0 visits" on a Sunday is the line that teaches
    // people to stop opening this.
    if (missing.length > 0 || visits > 0) {
      sections.push(`Your team yesterday (${visits} visit${visits === 1 ? "" : "s"}):\n${lines.join("\n")}`);
    }
  }

  // Only when it is AT RISK. A milestone line every morning saying "on track"
  // is the line people stop reading, which is the line you need them to read
  // the morning it changes.
  if (facts.milestone?.atRisk) {
    sections.push(
      `Milestone: ${facts.milestone.actual} of ${facts.milestone.target} by month ` +
        `${facts.milestone.month} — behind pace.`,
    );
  }

  const worthSending = sections.length > 0;
  // A manager with two people who did not turn up has something that needs them
  // today, the same as an overdue follow-up.
  const urgent =
    facts.followUpsDue.length +
    facts.attention.length +
    (facts.team?.filter((t) => !t.checkedIn).length ?? 0);

  return {
    subject: !worthSending
      ? "Nothing to report"
      : urgent > 0
        // The VERB agrees too. "1 thing need you today" is the kind of line
        // that makes an automated email read as automated.
        ? `${urgent} thing${urgent === 1 ? " needs" : "s need"} you today`
        : "Yesterday in your city",
    body: worthSending
      ? `${facts.partnerName}\n\n${sections.join("\n\n")}\n\nOpen the portal to act on any of these.`
      : "",
    worthSending,
  };
}

/** Which events a digest covers, so a preferences screen and it cannot disagree. */
export const DIGEST_EVENTS: NotificationEvent[] = NOTIFICATION_EVENTS.filter((e) =>
  ["trial.started", "payment.failed", "trial.ending", "milestone.at_risk"].includes(e),
) as NotificationEvent[];
