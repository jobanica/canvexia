import { BUTTON_TAG } from "./render";

/**
 * Starting copy for each step, seeded on first load and editable from
 * super-admin afterwards.
 *
 * Taglish on purpose — the audience is Filipino restaurant owners, and this
 * reads like a person rather than a SaaS. Each one has a single ask.
 *
 * `{{name}}` is the restaurant, `{{build}}` returns them to the builder, and
 * the activate button carries their own payment link.
 */
export const DEFAULT_COPY: Record<string, { subject: string; body: string }> = {
  // ---- Track A: gave an email, hasn't finished a preview -------------------
  A_immediate: {
    subject: "Tapusin natin ang restaurant page mo 🍽️",
    body: `Hi! Nasimulan mo na ang online ordering page ng {{name}}.

Ilang minuto na lang tapos na — i-preview mo agad kung paano mag-o-order ang customers mo.

{{build}}`,
  },
  A_2h: {
    subject: "Andiyan pa ba? Tapusin mo lang 👀",
    body: `Malapit na ang {{name}}!

Add mo lang ang menu mo at makikita mo agad ang sarili mong ordering page.

{{build}}`,
  },
  A_day1: {
    subject: "Ganito kadali mag-order sa page mo",
    body: `Imagine: may nag-message sa page mo. Imbes na "wait po," diretso na sila sa ordering page mo — kahit hatinggabi.

Tapusin mo ang sa {{name}}:

{{build}}`,
  },
  A_day3: {
    subject: "Stuck ka ba sa menu?",
    body: `Kung nahihirapan ka sa menu, add mo muna ang 3–5 bestsellers mo para makita mo ang preview. Pwede mo pang dagdagan later.

{{build}}`,
  },
  A_day7: {
    subject: "Huling paalala 🙏",
    body: `Nandito pa rin ang restaurant page ng {{name}}, nakahintay lang na tapusin. 2 minutes lang.

{{build}}`,
  },

  // ---- Track B: preview built, hasn't paid ---------------------------------
  B_immediate: {
    subject: "Ready na ang restaurant mo 🎉",
    body: `Congrats! Live na ang preview ng {{name}}. Makikita na ng customers ang menu mo at maka-order sila.

Para tanggapin ang totoong orders, activate mo na — ₱499 one-time, sa'yo na habambuhay.

${BUTTON_TAG}

Tingnan mo muna: {{preview}}`,
  },
  B_day1: {
    subject: "Ito ang mangyayari pag na-activate mo",
    body: `Pag-activate mo ang {{name}}:

• Sarili mong ordering page
• QR code para sa mga table mo
• Diretso sa'yo ang orders — hindi sa delivery app na kumukuha ng 25%

${BUTTON_TAG}`,
  },
  B_day3: {
    subject: "Ilang order na ang nawawala sa'yo?",
    body: `Bawat araw na walang ordering page, may customers na hindi maka-order pag busy ka o sarado ang chat.

₱499 one-time, tapos sa'yo na ang {{name}} page habambuhay.

${BUTTON_TAG}`,
  },
  // Social proof. NOTE: this is the one step that makes a claim about other
  // businesses rather than about the product, so keep it honest — swap in a
  // real named result once there is one, and pause the step until then if you'd
  // rather say nothing at all.
  B_day5: {
    subject: "Bakit direct orders ang pinipili ng ibang food business",
    body: `Restaurant, café, milk tea shop, carinderia — kahit anong klaseng food business, pareho ang problema: 20–25% ng bawat order, napupunta sa delivery app.

Sa sariling ordering page, diretso sa'yo ang bayad at sa'yo rin ang customer.

${BUTTON_TAG}`,
  },
  B_day7: {
    subject: "Activate na? ₱499 lang, one-time",
    body: `Simple lang: ₱499 one-time, live agad ang {{name}}.

${BUTTON_TAG}`,
  },
  B_day14: {
    subject: "Last check — buhay pa ang preview mo",
    body: `Nandiyan pa ang preview ng {{name}}. Kung ready ka na, isang click na lang.

${BUTTON_TAG}

Kung hindi pa, walang problema — hindi na kita ie-email tungkol dito.`,
  },
};
