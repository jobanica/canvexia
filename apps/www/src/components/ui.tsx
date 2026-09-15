import Link from "next/link";
import { IconArrow } from "./Icons";

/**
 * The pieces every section is built from.
 *
 * Local to this app rather than in packages/ui: that package holds what a
 * SECOND app draws (the mark), and nothing else here has a second consumer.
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
  tone?: "paper" | "white" | "deep";
}) {
  const bg =
    tone === "deep" ? "bg-midnight text-paper" : tone === "white" ? "bg-white" : "bg-paper";
  return (
    <section id={id} className={`${bg} py-14 sm:py-20 ${className}`}>
      <Container>{children}</Container>
    </section>
  );
}

/** The small uppercase label above a heading, with a rule either side. */
export function Eyebrow({
  children,
  tone = "dark",
  centered = false,
}: {
  children: React.ReactNode;
  tone?: "dark" | "light";
  centered?: boolean;
}) {
  const color = tone === "dark" ? "text-coral" : "text-ember";
  return (
    <p
      className={`flex items-center gap-3 text-[0.7rem] font-bold uppercase tracking-[0.22em] ${color} ${
        centered ? "justify-center" : ""
      }`}
    >
      <span aria-hidden="true" className="h-px w-6 bg-current opacity-60" />
      {children}
      {centered && <span aria-hidden="true" className="h-px w-6 bg-current opacity-60" />}
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
      ? "text-[2.05rem] leading-[1.06] sm:text-[2.7rem] lg:text-[3.1rem]"
      : "text-[1.6rem] leading-[1.16] sm:text-[2.1rem]";
  return (
    <As className={`font-display font-bold tracking-[-0.025em] ${size} ${className}`}>
      {children}
    </As>
  );
}

/**
 * Eyebrow, heading and an optional line under it.
 *
 * `centered` is the reference layout's section header; the left-aligned form is
 * kept for the sections that carry a long lead, where centred text over 68
 * characters is harder to read than it looks in a mockup.
 */
export function SectionHead({
  eyebrow,
  title,
  lead,
  tone = "dark",
  centered = false,
}: {
  eyebrow: string;
  title: React.ReactNode;
  lead?: React.ReactNode;
  tone?: "dark" | "light";
  centered?: boolean;
}) {
  return (
    <div className={centered ? "mx-auto max-w-2xl text-center" : "max-w-readable"}>
      <Eyebrow tone={tone} centered={centered}>
        {eyebrow}
      </Eyebrow>
      <Heading className={`mt-3 ${tone === "light" ? "text-paper" : ""}`}>{title}</Heading>
      {lead && (
        <p
          className={`mt-4 text-base sm:text-lg ${
            tone === "dark" ? "text-ink-soft" : "text-paper/70"
          } ${centered ? "mx-auto" : ""}`}
        >
          {lead}
        </p>
      )}
    </div>
  );
}

type CtaProps = {
  href: string;
  children: React.ReactNode;
  variant?: "accent" | "ink" | "outline" | "light";
  external?: boolean;
  arrow?: boolean;
  className?: string;
};

/**
 * Pill buttons, with the arrow disc from the reference.
 *
 * The arrow is a real element rather than a character, so it keeps its circle
 * on every platform and can be hidden from assistive tech — an arrow glyph read
 * aloud after every button is noise.
 */
export function Cta({
  href,
  children,
  variant = "accent",
  external,
  arrow = false,
  className = "",
}: CtaProps) {
  const base =
    "group inline-flex min-h-[52px] items-center justify-center gap-3 rounded-pill pl-7 text-[0.95rem] font-semibold transition-all";
  const pad = arrow ? "pr-2" : "pr-7";
  const styles = {
    accent: "accent-gradient text-white shadow-glow hover:brightness-105",
    ink: "bg-ink text-paper hover:bg-black",
    outline: "border border-ink/20 text-ink hover:border-ink hover:bg-ink/[0.04]",
    light: "border border-paper/25 text-paper hover:bg-paper/10",
  }[variant];

  const inner = (
    <>
      {children}
      {arrow && (
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-transform group-hover:translate-x-0.5 ${
            variant === "accent" ? "bg-white/20 text-white" : "bg-ink/10 text-current"
          }`}
        >
          <IconArrow size={16} />
        </span>
      )}
    </>
  );

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`${base} ${pad} ${styles} ${className}`}
      >
        {inner}
      </a>
    );
  }
  return (
    <Link href={href} className={`${base} ${pad} ${styles} ${className}`}>
      {inner}
    </Link>
  );
}

/** The white card the reference uses everywhere. */
export function Card({
  children,
  className = "",
  hover = false,
}: {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <div
      className={`rounded-card border border-line bg-white p-6 shadow-card sm:p-7 ${
        hover ? "transition-shadow hover:shadow-lift" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * The tinted rounded square behind a service icon.
 *
 * `tone` picks a wash from the one accent rather than introducing new hues —
 * the reference uses four unrelated colours here, which would put green and
 * blue on a page whose brand is coral and ember.
 */
export function IconTile({
  children,
  tone = "coral",
  size = "md",
}: {
  children: React.ReactNode;
  tone?: "coral" | "ember" | "ink" | "gradient";
  size?: "sm" | "md";
}) {
  const box = size === "sm" ? "h-11 w-11 rounded-xl" : "h-14 w-14 rounded-2xl";
  const styles = {
    coral: "bg-coral/10 text-coral",
    ember: "bg-ember/15 text-ember",
    ink: "bg-ink/[0.06] text-ink",
    gradient: "accent-gradient text-white shadow-glow",
  }[tone];
  return (
    <span className={`inline-flex shrink-0 items-center justify-center ${box} ${styles}`}>
      {children}
    </span>
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
      className={`inline-flex items-center rounded-pill px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] ${styles}`}
    >
      {children}
    </span>
  );
}
