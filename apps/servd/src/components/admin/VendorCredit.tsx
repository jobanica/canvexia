import { Wordmark } from "@/components/Wordmark";

/**
 * WHO SUPPLIES THIS SOFTWARE, and who to ring when it breaks.
 *
 * REPORTED — "add merchant dashboard branding also." A partner-sold merchant's
 * dashboard said "Powered by Servd", offered Servd's tutorials, and had a
 * feedback button that writes to Servd. To that restaurant the PARTNER is the
 * software company: they signed with them, they pay them, and they will ring
 * them first. `getMerchantFacingBrand` was written for exactly this and had no
 * callers.
 *
 * TWO THINGS, and the second is the one that matters. The credit line is
 * cosmetic. The support block is not: without it, a shop in Tagum with a
 * broken printer at 7pm has Servd's address and nobody who answers it. The
 * contacts come from the partner's own brand settings, and the block renders
 * only when they have filled at least one in — a "Get help" heading over
 * nothing is worse than no heading.
 *
 * `fullWhiteLabel` is the merchant's OWN plan feature, labelled "remove
 * 'Powered by Servd'". It still does exactly that. It does not remove a
 * partner's name, because that is not a third party's credit on their
 * software — it is the name of the company they bought it from, and hiding it
 * would send them back to Servd for support.
 */
export function VendorCredit({
  vendor,
  fullWhiteLabel,
}: {
  vendor: {
    displayName?: string | null;
    logoUrl?: string | null;
    supportEmail?: string | null;
    supportPhone?: string | null;
    supportUrl?: string | null;
  } | null;
  fullWhiteLabel: boolean;
}) {
  const name = vendor?.displayName?.trim() || null;
  const partnerSold = !!name && name !== "Servd";
  const contacts = [
    vendor?.supportEmail?.trim() ? { label: vendor.supportEmail.trim(), href: `mailto:${vendor.supportEmail.trim()}` } : null,
    vendor?.supportPhone?.trim() ? { label: vendor.supportPhone.trim(), href: `tel:${vendor.supportPhone.trim().replace(/\s+/g, "")}` } : null,
    vendor?.supportUrl?.trim() ? { label: "Help centre", href: vendor.supportUrl.trim() } : null,
  ].filter(Boolean) as { label: string; href: string }[];

  // A merchant who is nobody's — direct from Servd — and has paid to remove the
  // credit gets what they paid for: nothing here at all.
  if (!partnerSold && fullWhiteLabel) return null;

  return (
    <div className="px-3 pt-2">
      {partnerSold && contacts.length > 0 && (
        <>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-plum-ink/35">
            Get help
          </p>
          <ul className="mt-1 space-y-0.5">
            {contacts.map((c) => (
              <li key={c.href}>
                <a
                  href={c.href}
                  className="text-xs text-plum-ink/55 underline decoration-plum-ink/20 hover:text-plum-ink"
                  {...(c.href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}
                >
                  {c.label}
                </a>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="mt-2 flex items-center gap-1.5 text-[11px] text-plum-ink/35">
        {partnerSold ? (
          <>
            <span>Powered by</span>
            {vendor?.logoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={vendor.logoUrl}
                alt={name}
                className="h-4 w-auto max-w-[90px] object-contain opacity-70"
              />
            ) : (
              <span className="font-semibold text-plum-ink/45">{name}</span>
            )}
          </>
        ) : (
          <>
            Powered by <Wordmark size="0.72rem" />
          </>
        )}
      </p>
    </div>
  );
}
