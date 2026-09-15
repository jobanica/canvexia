import { Card, IconTile, Section, SectionHead } from "./ui";
import {
  IconBrand,
  IconChart,
  IconHandshake,
  IconPin,
  IconRepeat,
  IconUserPlus,
} from "./Icons";

/** Section 3. */
const ITEMS = [
  {
    icon: <IconPin size={24} />,
    title: "Exclusive territory",
    line: "One partner per city. Nobody else sells CANVEXIA software in yours.",
  },
  {
    icon: <IconHandshake size={24} />,
    title: "Every product in the catalog",
    line: "Unlimited merchant accounts across every vertical we ship.",
  },
  {
    icon: <IconBrand size={24} />,
    title: "White-label",
    line: "Your business name, your logo, your colors, your domain.",
  },
  {
    icon: <IconUserPlus size={24} />,
    title: "Onboarding + marketing kit",
    line: "Table cards, flyers, ad creatives, and a programme that walks you through the first merchants.",
  },
  {
    icon: <IconRepeat size={24} />,
    title: "A direct line to HQ",
    line: "Product and technical issues go to us, not to a ticket queue.",
  },
  {
    icon: <IconChart size={24} />,
    title: "Partner portal",
    line: "Live revenue statements. You see what you earned, per merchant, as it happens.",
  },
];

export function WhatYouGet() {
  return (
    <Section>
      <SectionHead
        centered
        eyebrow="What you get"
        title="What the partnership actually includes."
      />

      <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {ITEMS.map((item) => (
          <li key={item.title}>
            <Card hover className="flex h-full gap-4">
              <IconTile size="sm" tone="coral">
                {item.icon}
              </IconTile>
              <span>
                <h3 className="font-display text-base font-bold">{item.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{item.line}</p>
              </span>
            </Card>
          </li>
        ))}
      </ul>
    </Section>
  );
}
