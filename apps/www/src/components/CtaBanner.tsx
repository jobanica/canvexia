import { Container, Cta } from "./ui";
import { IconArrow } from "./Icons";

/**
 * The reference's gradient CTA bar.
 *
 * Appears twice — once mid-page, once before the form — because the page is
 * long and a reader who decides at section 5 should not have to scroll to 11 to
 * act. Both point at the same anchor.
 *
 * The button is WHITE on the gradient rather than gradient-on-white: a
 * gradient button on a gradient bar disappears, which is what the reference
 * avoids by putting a solid pill there too.
 */
export function CtaBanner({
  title,
  line,
  action,
  href = "#waitlist",
}: {
  title: string;
  line: string;
  action: string;
  href?: string;
}) {
  return (
    <div className="bg-paper py-4">
      <Container>
        <div className="accent-gradient relative overflow-hidden rounded-card px-6 py-8 shadow-glow sm:px-10 sm:py-9">
          <span
            aria-hidden="true"
            className="dot-grid absolute -right-4 -top-4 hidden h-32 w-40 text-white/30 sm:block"
          />
          <div className="relative flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-2xl font-bold text-white sm:text-3xl">{title}</h2>
              <p className="mt-1.5 text-sm text-white/85 sm:text-base">{line}</p>
            </div>
            <Cta
              href={href}
              variant="ink"
              arrow
              className="shrink-0 !bg-white !text-ink hover:!bg-white/90"
            >
              {action}
            </Cta>
          </div>
        </div>
      </Container>
    </div>
  );
}

/**
 * The contact strip that closes the reference layout, above the footer proper.
 *
 * NO SOCIAL ICONS. The reference has four; the handles for this company were
 * never supplied, and a row of icons linking nowhere is worse than a row that
 * is not there. Two real details instead.
 */
export function ContactBar({ email, site }: { email: string; site: string }) {
  return (
    <div className="border-t border-line bg-white py-5">
      <Container className="flex flex-col items-center justify-center gap-4 text-sm text-ink-soft sm:flex-row sm:gap-10">
        <a
          href={`mailto:${email}`}
          className="inline-flex items-center gap-2 font-medium hover:text-ink"
        >
          <IconArrow size={14} className="text-coral" />
          {email}
        </a>
        <span className="inline-flex items-center gap-2 font-medium">
          <IconArrow size={14} className="text-coral" />
          {site}
        </span>
      </Container>
    </div>
  );
}
