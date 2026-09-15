import { Section, SectionHead } from "./ui";

/** Section 3. */
const ITEMS = [
  {
    title: "Exclusive territory",
    line: "One partner per city. Nobody else sells CANVEXIA software in yours.",
  },
  {
    title: "Every product in the catalog",
    line: "Unlimited merchant accounts across every vertical we ship.",
  },
  {
    title: "White-label",
    line: "Your business name, your logo, your colors, your domain.",
  },
  {
    title: "Onboarding + marketing kit",
    line: "Table cards, flyers, ad creatives, and a programme that walks you through the first merchants.",
  },
  {
    title: "A direct line to HQ",
    line: "Product and technical issues go to us, not to a ticket queue.",
  },
  {
    title: "Partner portal",
    line: "Live revenue statements. You see what you earned, per merchant, as it happens.",
  },
];

export function WhatYouGet() {
  return (
    <Section>
      <SectionHead
        eyebrow="What you get"
        title="What the partnership actually includes."
      />

      <ul className="mt-12 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
        {ITEMS.map((item) => (
          <li key={item.title} className="border-t border-line pt-5">
            <h3 className="font-display text-base font-bold">{item.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{item.line}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}
