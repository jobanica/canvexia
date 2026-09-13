/**
 * Cold-outreach follow-up sequence for the client CRM. Pure data — safe to
 * import on the client and server. The cadence is 1 initial message + 3
 * follow-ups over ~10 days; if there's still no reply after the last follow-up,
 * move the prospect to Revisit (30 days) instead of messaging further.
 *
 * `waitDays` = days to wait AFTER the previous touch before this one is due.
 * Messages use {name} as a placeholder for the business name.
 */

export interface SequenceStep {
  step: number; // 1-based touch number
  key: string;
  label: string;
  waitDays: number;
  message: string;
  breakup?: boolean;
}

export const SEQUENCE: SequenceStep[] = [
  {
    step: 1,
    key: "initial",
    label: "Initial message",
    waitDays: 0,
    message:
      "Hi [Name]! Nakita ko si [Business Name] sa delivery apps. 👀\n\n" +
      "Grabe po kasi ang commissions ngayon —30% per order na nawawala sa profit niyo.\n\n" +
      "Sa 100,000 revenue, 30,000 sa app, mas malaki pa kita ng Food Panda kesa sa Restaurant nyo.\n\n" +
      "Pwede po namin kayo gawan ng ONLINE ORDERING SYSTEM, pag order ng customer, automatic papasok sa POS nyo tapos 0% commission pa\n\n" +
      "Libre lang po, wala kayong babayaran.\n\n" +
      "May personalized demo na po ako para sa [Business Name] — okay lang po bang i-share?",
  },
  {
    step: 2,
    key: "fu1",
    label: "Follow-up 1 — gentle bump",
    waitDays: 2,
    message:
      "Hi [Name], pa-follow up lang po sa message ko 🙂\n\n" +
      "Yung sariling online ordering system po para sa [Business Name] — diretso pasok sa POS nyo, walang 30% commission na kinakaltas. " +
      "Gusto nyo po bang makita muna yung quick demo?",
  },
  {
    step: 3,
    key: "fu2",
    label: "Follow-up 2 — new angle",
    waitDays: 3,
    message:
      "Hi po! Alam ko po busy kayo sa [Business Name]. 🙏\n\n" +
      "Marami na pong restaurant dito ang lumipat sa sariling ordering page para hindi na kainin ng app ang kita nila. " +
      "Padalhan ko po kayo ng 1-minute video para makita nyo kahit anong oras — okay lang po?",
  },
  {
    step: 4,
    key: "fu3",
    label: "Follow-up 3 — last try before revisit",
    waitDays: 5,
    message:
      "Hi [Name], libre lang po talaga — wala kayong babayaran at walang commission per order.\n\n" +
      "Gusto nyo po bang i-set up ko muna para sa [Business Name] para masubukan nyo nang walang risk? " +
      "Kung busy pa po ngayon, babalikan ko na lang po kayo after ng ilang linggo. 🙂",
  },
];

/**
 * The owner can override the editable parts of any step (label, wait days,
 * message). Stored as a small array keyed by `step`; the structural fields
 * (`key`, `breakup`) always come from the defaults above.
 */
export interface SequenceOverride {
  step: number;
  label?: string;
  waitDays?: number;
  message?: string;
}

/**
 * Merge saved overrides onto the default sequence and return the EFFECTIVE
 * sequence used everywhere (Send-today cards, scheduling, the editor). Pure —
 * safe on client and server. Bad/garbage overrides fall back to the default for
 * that field, so a stray value can never break outreach.
 */
export function mergeSequence(overrides?: SequenceOverride[] | null): SequenceStep[] {
  if (!Array.isArray(overrides) || overrides.length === 0) return SEQUENCE;
  const byStep = new Map<number, SequenceOverride>();
  for (const o of overrides) {
    if (o && typeof o.step === "number") byStep.set(o.step, o);
  }
  return SEQUENCE.map((base) => {
    const o = byStep.get(base.step);
    if (!o) return base;
    const message = typeof o.message === "string" && o.message.trim() ? o.message : base.message;
    const label = typeof o.label === "string" && o.label.trim() ? o.label : base.label;
    const waitDays =
      base.step === 1 // the initial message is always due immediately
        ? 0
        : typeof o.waitDays === "number" && Number.isFinite(o.waitDays) && o.waitDays >= 0
          ? Math.min(Math.round(o.waitDays), 90)
          : base.waitDays;
    return { ...base, message, label, waitDays };
  });
}

/** Total touches in the sequence (initial + follow-ups). */
export const TOTAL_TOUCHES = SEQUENCE.length;

/** Number of follow-ups after the initial message. */
export const FOLLOW_UPS = SEQUENCE.length - 1;

/** The next touch to send given how many have already been sent (`step`). */
export function nextStep(step: number, sequence: SequenceStep[] = SEQUENCE): SequenceStep | null {
  return step < sequence.length ? sequence[step] : null;
}

/**
 * Fill a step's message: [Business Name] → the business, [Name] → the contact
 * person (falls back to a polite "po" when no contact name is on file).
 */
export function renderMessage(message: string, business: string, contact?: string | null): string {
  const greet = (contact && contact.trim()) || "po";
  return message
    .replace(/\[Business Name\]/g, business || "your restaurant")
    .replace(/\[Name\]/g, greet);
}

export function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}
