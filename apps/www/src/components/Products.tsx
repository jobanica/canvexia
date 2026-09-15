import { PRODUCTS, type ProductId } from "@servd/core";
import { Badge, IconTile, Section, SectionHead, Card } from "./ui";
import { IconPill, IconPlate, IconPrinter, IconWash } from "./Icons";

/**
 * Section 4, as the reference's four service cards.
 *
 * The catalogue comes from the registry in `packages/core`, not from a list
 * here, so adding the laundry app does not also mean editing a landing page.
 *
 * What this file adds is the PUBLIC status, which is NOT the registry's `live`
 * flag and must not be confused with it:
 *
 *   registry `live` = a merchant can be provisioned into it today
 *   public status   = what a stranger should be told about it
 *
 * Resceta is the case that separates them. It is provisionable — the isolation
 * tests create a real pharmacy against a real database — and it has no paying
 * merchants, so it is "In development" here. Calling it live on a public page
 * because a boolean in another package is true would be the page inventing
 * traction, which is the one thing the brief rules out.
 *
 * NO MERCHANT COUNTS. Asked for and answered: customers do not need to know how
 * many merchants there are, and this database has none to count anyway — the
 * 258 in Davao belong to servdph.com, a different business on a different
 * database (D31).
 */
type PublicStatus = "live" | "development" | "coming";

const STATUS: Record<ProductId, PublicStatus> = {
  servd: "live",
  pharmacy: "development",
  printosph: "coming",
  laundry: "coming",
};

const STATUS_LABEL: Record<PublicStatus, string> = {
  live: "Live",
  development: "In development",
  coming: "Coming",
};

const ART: Record<ProductId, { icon: React.ReactNode; tone: "coral" | "ember" | "ink" }> = {
  servd: { icon: <IconPlate size={26} />, tone: "coral" },
  pharmacy: { icon: <IconPill size={26} />, tone: "ember" },
  printosph: { icon: <IconPrinter size={26} />, tone: "ink" },
  laundry: { icon: <IconWash size={26} />, tone: "ink" },
};

const NOTE: Partial<Record<ProductId, string>> = {
  servd: "Running in Davao City today.",
};

// Registry order is insertion order; the page wants live first.
const ORDER: PublicStatus[] = ["live", "development", "coming"];

export function Products() {
  const products = Object.values(PRODUCTS)
    .map((p) => ({ ...p, status: STATUS[p.id as ProductId] ?? "coming" }))
    .sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status));

  return (
    <Section id="products" tone="white" className="border-y border-line">
      <SectionHead
        centered
        eyebrow="What we build"
        title="Four verticals. One partner account."
      />

      <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {products.map((p) => {
          const art = ART[p.id as ProductId];
          return (
            <li key={p.id}>
              <Card hover className="flex h-full flex-col text-center">
                <span className="mx-auto">
                  <IconTile tone={p.status === "live" ? "gradient" : art.tone}>
                    {art.icon}
                  </IconTile>
                </span>
                <h3 className="mt-5 font-display text-lg font-bold">{p.name}</h3>
                <div className="mt-2 flex justify-center">
                  <Badge
                    tone={
                      p.status === "live" ? "live" : p.status === "development" ? "accent" : "muted"
                    }
                  >
                    {STATUS_LABEL[p.status]}
                  </Badge>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-ink-soft">{p.description}</p>
                {NOTE[p.id as ProductId] && (
                  <p className="mt-auto pt-3 text-sm font-semibold text-ink">
                    {NOTE[p.id as ProductId]}
                  </p>
                )}
              </Card>
            </li>
          );
        })}
      </ul>

      <p className="mt-8 text-center text-sm text-ink-soft">
        New verticals are added to every partner&rsquo;s account at no extra cost.
      </p>
    </Section>
  );
}
