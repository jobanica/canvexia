import { PRODUCTS, type ProductId } from "@servd/core";
import { Badge, Section, SectionHead } from "./ui";

/**
 * Section 4. The catalogue comes from the registry, not from a list here.
 *
 * `packages/core` already owns what a CANVEXIA product is, so adding the
 * laundry app must not also mean editing a landing page — that is the whole
 * point of the registry existing. What this file adds is the PUBLIC status,
 * which is not the registry's `live` flag and must not be confused with it:
 *
 *   registry `live`  = a merchant can be provisioned into it today
 *   public status    = what a stranger should be told about it
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
        eyebrow="The products"
        title="Four verticals. One partner account."
      />

      <ul className="mt-12 grid gap-px overflow-hidden rounded-xl bg-line sm:grid-cols-2">
        {products.map((p) => (
          <li key={p.id} className="flex flex-col bg-white p-6">
            <div className="flex items-start justify-between gap-4">
              <h3 className="font-display text-xl font-bold">{p.name}</h3>
              <Badge tone={p.status === "live" ? "live" : p.status === "development" ? "accent" : "muted"}>
                {STATUS_LABEL[p.status]}
              </Badge>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{p.description}</p>
            {NOTE[p.id as ProductId] && (
              <p className="mt-3 text-sm font-medium text-ink">{NOTE[p.id as ProductId]}</p>
            )}
          </li>
        ))}
      </ul>

      <p className="mt-6 text-sm text-ink-soft">
        New verticals are added to every partner&rsquo;s account at no extra cost.
      </p>
    </Section>
  );
}
