import Link from "next/link";
import { requirePartnerPageWith } from "@/server/partners/auth";
import { getPartnerProfile } from "@/server/partners/overview";
import { listPartnerDomains, domainStatus } from "@/server/partners/domains";
import { PortalShell } from "@/components/partner/PortalShell";
import { CustomDomainForm } from "@/components/partner/CustomDomainForm";
import { systemDb } from "@/server/tenancy/scoped-db";

const STATE_CHIP: Record<string, string> = {
  planned: "bg-brand-ink/[0.06] text-brand-ink/55",
  pending: "bg-brand-primary/12 text-brand-primary",
  verifying: "bg-brand-primary/12 text-brand-primary",
  active: "bg-brand-ink text-white",
  error: "bg-guava/12 text-guava",
};

export default async function PartnerDomainsPage() {
  const partner = await requirePartnerPageWith("domains.write");
  const profile = await getPartnerProfile(partner.id);
  const domains = await listPartnerDomains(profile?.slug ?? null);
  const own = await systemDb((tx) =>
    tx.partner.findUnique({
      where: { id: partner.id },
      select: { customDomain: true, customDomainState: true },
    }),
  ).catch(() => null);

  // The host's own verification records, when a provider is configured. Falls
  // back to the static instructions in the form when it is not.
  const live = own?.customDomain ? await domainStatus(own.customDomain).catch(() => null) : null;

  return (
    <PortalShell
      partner={partner}
      title="Domains"
      subtitle="Where your merchants and their customers reach you."
    >
        <Link href="/partner/brand" className="text-sm text-brand-ink/50 hover:text-brand-ink">
          ← Brand
        </Link>
        {domains.length === 0 ? (
          <p className="mt-6 rounded-tile border border-brand-ink/10 bg-white p-6 text-sm text-brand-ink/55">
            You need a subdomain before you have an address. Set one in Brand.
          </p>
        ) : (
          <ul className="mt-6 space-y-3">
            {domains.map((d) => (
              <li
                key={d.host}
                className="rounded-tile border border-brand-ink/10 bg-white p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <code className="break-all text-sm font-semibold">{d.host}</code>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide ${
                      STATE_CHIP[d.state]
                    }`}
                  >
                    {d.state}
                  </span>
                </div>
                {d.note && <p className="mt-2 text-xs text-brand-ink/50">{d.note}</p>}
                {d.records.length > 0 && (
                  <table className="mt-3 w-full text-xs">
                    <tbody className="divide-y divide-brand-ink/[0.07]">
                      {d.records.map((r) => (
                        <tr key={`${r.type}-${r.name}`}>
                          <td className="py-2 font-semibold">{r.type}</td>
                          <td className="py-2 font-mono">{r.name}</td>
                          <td className="break-all py-2 font-mono">{r.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </li>
            ))}
          </ul>
        )}

        {/*
          The instructions ARE the feature. This was a dashed box saying "not
          wired up yet, tell HQ which one" — with no way to tell HQ and no
          records to add, so a partner who wanted their own address had nothing
          to do next.

          The attach itself still needs a hosting credential this deployment
          does not carry, and that is said plainly rather than dressed up as a
          progress bar nothing is driving. What the partner CAN do without us —
          point their DNS — is spelled out exactly, with copyable values.
        */}
        <div className="mt-6">
          <CustomDomainForm
            current={own?.customDomain ?? null}
            state={own?.customDomainState ?? null}
            aRecordIp="76.76.21.21"
            cnameTarget="cname.vercel-dns.com"
            records={live?.records ?? []}
            selfServe={!!live?.configured}
          />
        </div>
    </PortalShell>
  );
}
