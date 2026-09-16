/**
 * Composing and pacing a campaign, as pure functions.
 *
 * The two limits in here — the send window and the frequency cap — are the
 * difference between a marketing tool and a nuisance, and both are decided
 * without a database so they can be tested at a fixed clock.
 */

/** Manila is UTC+8 all year. No DST, which is why this is a constant. */
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

export interface SendWindow {
  /** Minutes past midnight, Manila. 09:00 is 540. */
  startMin: number;
  endMin: number;
}

export const DEFAULT_WINDOW: SendWindow = { startMin: 9 * 60, endMin: 20 * 60 };

/** "09:00" from 540. For the settings screen and for the queued-until note. */
export function minutesToLabel(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Minutes past Manila midnight for an instant. */
export function manilaMinutes(at: Date): number {
  const shifted = new Date(at.getTime() + MANILA_OFFSET_MS);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

export function withinWindow(at: Date, window: SendWindow = DEFAULT_WINDOW): boolean {
  const m = manilaMinutes(at);
  return m >= window.startMin && m < window.endMin;
}

/**
 * When this message may actually go out.
 *
 * RETURNS THE INSTANT, not a boolean, because "queue to the next allowed slot"
 * is what the brief asks for and a boolean leaves the caller to work out when
 * that is — which is the arithmetic that gets Manila wrong.
 *
 * Before the window opens: today at the start. After it closes: TOMORROW at the
 * start, which is the case a naive implementation gets wrong by sending a
 * backlog at one minute past midnight.
 */
export function nextSendTime(at: Date, window: SendWindow = DEFAULT_WINDOW): Date {
  const m = manilaMinutes(at);
  if (m >= window.startMin && m < window.endMin) return at;

  // Manila midnight of the day `at` falls in, as a UTC instant.
  const shifted = new Date(at.getTime() + MANILA_OFFSET_MS);
  const midnightUtc = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  ) - MANILA_OFFSET_MS;

  const today = new Date(midnightUtc + window.startMin * 60_000);
  if (m < window.startMin) return today;
  return new Date(today.getTime() + 86_400_000);
}

/**
 * The frequency cap.
 *
 * `sentAt` is the list of marketing messages this contact has already had. The
 * cap is per CONTACT, not per campaign: three campaigns each obeying their own
 * cap is still three texts to one person in a week.
 *
 * A 1:1 reply is NOT counted — the brief exempts it, and rightly: somebody who
 * texted you a question should get an answer, not a policy.
 */
export function capReached(
  sentAt: Date[],
  now: Date,
  cap: { count: number; days: number } = { count: 2, days: 7 },
): boolean {
  if (cap.count <= 0) return true;
  const since = now.getTime() - cap.days * 86_400_000;
  return sentAt.filter((d) => d.getTime() >= since).length >= cap.count;
}

/**
 * The merge fields the composer offers.
 *
 * FALLBACKS ARE NOT OPTIONAL. "Hi {name}" with no name on the row produces
 * "Hi ," which reads as a broken mail-merge and tells the recipient exactly how
 * much attention they are getting. Each field falls back to something that
 * still reads as a sentence.
 */
export interface MergeValues {
  name?: string | null;
  businessName?: string | null;
  staffName?: string | null;
  partnerName?: string | null;
}

export const MERGE_FIELDS = ["name", "business_name", "staff_name", "partner_name"] as const;

export function renderMerge(template: string, values: MergeValues): string {
  const map: Record<string, string> = {
    name: (values.name ?? "").trim() || "there",
    business_name: (values.businessName ?? "").trim() || "your business",
    staff_name: (values.staffName ?? "").trim() || (values.partnerName ?? "").trim() || "us",
    partner_name: (values.partnerName ?? "").trim() || "us",
  };
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in map ? map[key] : whole,
  );
}

/**
 * The WORST-CASE length of a template, for the composer's counter.
 *
 * Merge fields make every recipient's message a different length, so a counter
 * that measures the template is wrong for everybody. This substitutes the
 * longest value that will actually be used, so the number shown is the number
 * that could be charged — never less.
 */
export function worstCaseBody(template: string, samples: MergeValues[]): string {
  if (samples.length === 0) {
    return renderMerge(template, {});
  }
  let longest = "";
  for (const sample of samples) {
    const rendered = renderMerge(template, sample);
    if (rendered.length > longest.length) longest = rendered;
  }
  return longest;
}
