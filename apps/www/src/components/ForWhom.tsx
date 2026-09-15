import { Section, SectionHead } from "./ui";

/** Section 7. Blunt on purpose — the "not for" list is the useful one. */
const FOR = [
  "You have sold something before — insurance, real estate, load, your own shop.",
  "You are willing to walk into a business and ask for the owner.",
  "You have ₱25,000–₱100,000 you can put into a licence without borrowing it.",
  "You can give this real hours every week, alongside a job if that is your situation.",
  "You want something that keeps paying after the sale, not a one-time commission.",
];

const NOT_FOR = [
  "You are looking for passive income. This is not that.",
  "You will not visit businesses in person. Nothing here closes over chat.",
  "You need income in month one. The first merchants take time.",
  "You want to earn by recruiting other partners. There is nothing to recruit into.",
  "You expect leads handed to you. The city is yours; so is the walking.",
];

export function ForWhom() {
  return (
    <Section>
      <SectionHead
        centered
        eyebrow="Who this is for"
        title="Read the second list first."
      />

      <div className="mt-12 grid gap-10 lg:grid-cols-2 lg:gap-16">
        <div>
          <h3 className="font-display text-lg font-bold">This is for you if</h3>
          <ul className="mt-5 space-y-4">
            {FOR.map((f) => (
              <li key={f} className="flex gap-3 border-b border-line pb-4 text-sm leading-relaxed text-ink-soft">
                <span aria-hidden="true" className="mt-[0.6em] h-px w-3 shrink-0 bg-coral" />
                {f}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="font-display text-lg font-bold">This is not for you if</h3>
          <ul className="mt-5 space-y-4">
            {NOT_FOR.map((f) => (
              <li key={f} className="flex gap-3 border-b border-line pb-4 text-sm leading-relaxed text-ink-soft">
                <span aria-hidden="true" className="mt-[0.6em] h-px w-3 shrink-0 bg-ink-faint" />
                {f}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  );
}
