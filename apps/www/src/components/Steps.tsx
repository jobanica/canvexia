import { Container } from "./ui";
import { IconApply, IconBrand, IconChart, IconHandshake } from "./Icons";

/**
 * Section 2 as the reference's dark four-column band, lifted so it overlaps the
 * hero's lower edge.
 *
 * The negative margin is the one piece of this layout that can bite: a card
 * pulled up over the section above it needs the section above to have room, and
 * on a phone it has none. So the lift only applies from `sm` up, and below that
 * the band is an ordinary block.
 */
const STEPS = [
  {
    icon: <IconApply size={26} />,
    title: "Apply for your city",
    line: "One partner per city. You tell us where; we check it is open.",
  },
  {
    icon: <IconBrand size={26} />,
    title: "Get onboarded and branded",
    line: "Your business name, your logo, your domain. We set it up with you.",
  },
  {
    icon: <IconHandshake size={26} />,
    title: "Sign up local businesses",
    line: "You visit them, you demo, you close. This is the part that is work.",
  },
  {
    icon: <IconChart size={26} />,
    title: "Earn 70% monthly",
    line: "For as long as the merchant stays subscribed. Paid monthly.",
  },
];

export function Steps() {
  return (
    <section id="how" className="bg-paper pb-16 sm:-mt-12 sm:pb-24">
      <Container>
        <ol className="relative z-10 grid overflow-hidden rounded-card bg-midnight shadow-lift sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li
              key={s.title}
              className="relative border-b border-midnight-line p-7 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 lg:p-8"
            >
              <span className="absolute right-6 top-6 font-display text-sm font-bold text-paper/20">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="accent-gradient inline-flex h-12 w-12 items-center justify-center rounded-2xl text-white">
                {s.icon}
              </span>
              <h3 className="mt-5 font-display text-lg font-bold leading-snug text-paper">
                {s.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-paper/60">{s.line}</p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}
