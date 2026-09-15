import { Section, SectionHead } from "./ui";

/** Section 2. Four steps, one line each. */
const STEPS = [
  {
    title: "Apply for your city",
    line: "One partner per city. You tell us where; we check it is open.",
  },
  {
    title: "Get onboarded and branded",
    line: "Your business name, your logo, your domain. We set it up with you.",
  },
  {
    title: "Sign up local businesses",
    line: "You visit them, you demo, you close. This is the part that is work.",
  },
  {
    title: "Earn 70% monthly, recurring",
    line: "For as long as the merchant stays subscribed. Paid monthly.",
  },
];

export function Steps() {
  return (
    <Section id="how" tone="white" className="border-y border-line">
      <SectionHead eyebrow="How it works" title="Four steps. That's the whole model." />

      <ol className="mt-12 grid gap-px overflow-hidden rounded-xl bg-line sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <li key={s.title} className="bg-white p-6">
            <span className="font-display text-sm font-bold text-coral">
              {String(i + 1).padStart(2, "0")}
            </span>
            <h3 className="mt-3 font-display text-lg font-bold leading-snug">{s.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{s.line}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
