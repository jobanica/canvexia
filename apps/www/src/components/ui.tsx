import Link from "next/link";

/**
 * The five things every section is made of.
 *
 * Local to this app rather than in packages/ui, per the brief: packages/ui is
 * an empty shell, and a shared component library whose first member is a
 * landing page's section heading is a library that will never be used twice.
 */

export function Container({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`mx-auto w-full max-w-6xl px-5 sm:px-8 ${className}`}>{children}</div>;
}

export function Section({
  id,
  children,
  className = "",
  tone = "paper",
}: {
  id?: string;
  children: React.ReactNode;
  className?: string;
  tone?: "paper" | "white" | "ink";
}) {
  const bg =
    tone === "ink" ? "bg-ink text-paper" : tone === "white" ? "bg-white" : "bg-paper";
  return (
    <section id={id} className={`${bg} py-16 sm:py-24 ${className}`}>
      <Container>{children}</Container>
    </section>
  );
}

/** The small uppercase label above a heading. */
export function Eyebrow({ children, tone = "dark" }: { children: React.ReactNode; tone?: "dark" | "light" }) {
  return (
    <p
      className={`text-[0.7rem] font-semibold uppercase tracking-[0.2em] ${
        tone === "dark" ? "text-ink-faint" : "text-paper/55"
      }`}
    >
      {children}
    </p>
  );
}

export function Heading({
  children,
  as: As = "h2",
  className = "",
}: {
  children: React.ReactNode;
  as?: "h1" | "h2" | "h3";
  className?: string;
}) {
  const size =
    As === "h1"
      ? "text-[2.1rem] leading-[1.06] sm:text-5xl lg:text-[3.6rem]"
      : "text-[1.7rem] leading-[1.12] sm:text-4xl";
  return (
    <As className={`font-display font-bold tracking-[-0.02em] ${size} ${className}`}>
      {children}
    </As>
  );
}

/**
 * A heading block: rule, eyebrow, heading, and an optional line under it.
 *
 * One component because twelve sections repeating the same four elements by
 * hand is twelve chances for the spacing to drift.
 */
export function SectionHead({
  eyebrow,
  title,
  lead,
  tone = "dark",
}: {
  eyebrow: string;
  title: React.ReactNode;
  lead?: React.ReactNode;
  tone?: "dark" | "light";
}) {
  return (
    <div className="max-w-readable">
      <span className="rule-accent" aria-hidden="true" />
      <div className="mt-5">
        <Eyebrow tone={tone}>{eyebrow}</Eyebrow>
      </div>
      <Heading className="mt-3">{title}</Heading>
      {lead && (
        <p className={`mt-4 text-base sm:text-lg ${tone === "dark" ? "text-ink-soft" : "text-paper/70"}`}>
          {lead}
        </p>
      )}
    </div>
  );
}

type CtaProps = {
  href: string;
  children: React.ReactNode;
  variant?: "solid" | "outline" | "light";
  external?: boolean;
  className?: string;
};

/**
 * Buttons are ink, not coral.
 *
 * The accent is a 40px rule and a badge; the calls to action are near-black on
 * paper. It is the plainer choice and it is the one that reads as a company
 * rather than a campaign.
 */
export function Cta({ href, children, variant = "solid", external, className = "" }: CtaProps) {
  const base =
    "inline-flex min-h-[48px] items-center justify-center rounded-lg px-6 text-[0.95rem] font-semibold transition-colors";
  const styles = {
    solid: "bg-ink text-paper hover:bg-black",
    outline: "border border-ink/25 text-ink hover:border-ink hover:bg-ink/[0.04]",
    light: "border border-paper/30 text-paper hover:bg-paper/10",
  }[variant];

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`${base} ${styles} ${className}`}
      >
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={`${base} ${styles} ${className}`}>
      {children}
    </Link>
  );
}

/** Product and territory status pills. */
export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "live" | "neutral" | "accent" | "muted";
}) {
  const styles = {
    live: "bg-ink text-paper",
    accent: "bg-coral/10 text-coral ring-1 ring-inset ring-coral/25",
    neutral: "bg-ink/[0.06] text-ink-soft ring-1 ring-inset ring-ink/10",
    muted: "bg-transparent text-ink-faint ring-1 ring-inset ring-line",
  }[tone];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] ${styles}`}
    >
      {children}
    </span>
  );
}
