import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { systemDb } from "@/server/tenancy/scoped-db";
import { parseBrandConfig } from "@servd/core";
import { formatPeso } from "@/lib/money";
import { manilaDate } from "@/lib/time/manila";
import { PrintButton } from "@/components/billing/PrintButton";

/**
 * One invoice, as the restaurant sees it — and as they print it.
 *
 * PRINTED BY THE BROWSER, not rendered to a PDF on the server. A PDF library is
 * a dependency, and this repository's brief says to ask before adding one; more
 * to the point, Ctrl-P already produces a clean A4 PDF on every device a shop
 * owner has, including a phone. What that needs from us is a page that prints
 * well, which is what the `print:` rules below are for.
 *
 * IT WEARS THE PARTNER'S BRAND, not Servd's. The restaurant pays their operator
 * and has often never heard of Servd; an invoice for money they sent to
 * "Tagum City Partner" that says Servd across the top is one they will query.
 * Falls back to the operator's plain name when they have not set a brand up —
 * never to Servd's.
 */
export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { restaurantId } = await requireAdminPage({ allowSuspended: true });
  const { id } = await params;

  // Scoped by restaurantId: another shop's invoice is not found rather than
  // refused, so an id cannot be probed to learn that it exists.
  const invoice = await systemDb((tx) =>
    tx.restaurantInvoice.findFirst({
      where: { id, restaurantId },
      select: {
        id: true, invoiceNo: true, amount: true, status: true,
        periodStart: true, periodEnd: true, paidAt: true, createdAt: true,
        issuedByPartnerId: true,
        restaurant: { select: { name: true, businessAddress: true } },
      },
    }),
  ).catch(() => null);
  if (!invoice) notFound();

  const partner = invoice.issuedByPartnerId
    ? await systemDb((tx) =>
        tx.partner.findUnique({
          where: { id: invoice.issuedByPartnerId! },
          select: { name: true, brandConfig: true },
        }),
      ).catch(() => null)
    : null;

  const brand = parseBrandConfig(partner?.brandConfig);
  const issuer = brand.legalName || brand.displayName || partner?.name || "Servd";
  const accent = brand.primaryColor || "#3B1E54";

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 print:max-w-none print:px-0 print:py-0">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href="/admin/billing" className="text-sm text-plum-ink/50">
          ← Billing
        </Link>
        <PrintButton />
      </div>

      <article className="rounded-tile border border-plum-ink/10 bg-white p-8 print:rounded-none print:border-0 print:p-0">
        <header
          className="flex flex-wrap items-start justify-between gap-4 border-b pb-5"
          style={{ borderColor: accent }}
        >
          <div className="min-w-0">
            {brand.logoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={brand.logoUrl} alt={issuer} className="h-12 w-auto max-w-[220px] object-contain" />
            ) : (
              <p className="font-heading text-xl font-bold" style={{ color: accent }}>
                {issuer}
              </p>
            )}
            {brand.legalName && brand.logoUrl && (
              <p className="mt-1 text-sm text-plum-ink/60">{brand.legalName}</p>
            )}
            <p className="mt-1 text-xs text-plum-ink/50">
              {[brand.supportEmail, brand.supportPhone].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="text-right">
            <p className="font-heading text-lg font-bold">INVOICE</p>
            <p className="text-xs text-plum-ink/50">{invoice.invoiceNo ?? invoice.id.slice(0, 8)}</p>
            <p className="mt-1 text-xs text-plum-ink/50">{manilaDate(invoice.createdAt)}</p>
          </div>
        </header>

        <section className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-plum-ink/45">Billed to</p>
          <p className="font-semibold">{invoice.restaurant.name}</p>
          {invoice.restaurant.businessAddress && (
            <p className="text-sm text-plum-ink/60">{invoice.restaurant.businessAddress}</p>
          )}
        </section>

        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b border-plum-ink/10 text-left text-xs uppercase tracking-wide text-plum-ink/45">
              <th className="py-2 font-semibold">Description</th>
              <th className="py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-plum-ink/[0.07]">
              <td className="py-3">
                Subscription
                <span className="block text-xs text-plum-ink/50">
                  {manilaDate(invoice.periodStart)} – {manilaDate(invoice.periodEnd)}
                </span>
              </td>
              <td className="py-3 text-right tabular-nums">{formatPeso(invoice.amount)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td className="py-3 text-right font-semibold">Total</td>
              <td className="py-3 text-right font-heading text-lg font-bold tabular-nums">
                {formatPeso(invoice.amount)}
              </td>
            </tr>
          </tfoot>
        </table>

        {invoice.status === "paid" && invoice.paidAt && (
          <p
            className="mt-2 inline-block rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide text-white"
            style={{ backgroundColor: accent }}
          >
            Paid {manilaDate(invoice.paidAt)}
          </p>
        )}

        {/*
          The partner's own legal footer — their TIN, their business style, a
          "not a BIR official receipt" line if they need one. We do not invent
          any of it: an invented tax line on somebody else's invoice is their
          problem, not ours.
        */}
        {brand.legalFooter && (
          <p className="mt-6 border-t border-plum-ink/10 pt-4 text-xs leading-relaxed text-plum-ink/50">
            {brand.legalFooter}
          </p>
        )}
      </article>
    </div>
  );
}
