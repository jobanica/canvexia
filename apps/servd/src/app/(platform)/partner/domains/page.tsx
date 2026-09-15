import Link from "next/link";
import { requirePartnerPageWith } from "@/server/partners/auth";
import { getPartnerProfile } from "@/server/partners/overview";
import { listPartnerDomains } from "@/server/partners/domains";
import { PortalNav } from "@/components/partner/PortalNav";

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

  return (
    <>
      <PortalNav partner={partner} />
      <div className="mx-auto max-w-3xl px-6 py-8">
        <Link href="/partner/brand" className="text-sm text-brand-ink/50 hover:text-brand-ink">
          ← Brand
        </Link>
        <h1 className="mt-4 font-heading text-2xl font-bold">Domains</h1>
        <p className="mt-1 max-w-readable text-sm text-brand-ink/55">
          Where your merchants and their customers reach you.
        </p>

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
          Adding a custom domain is a real feature and it is NOT here yet:
          adding one means a write to the Vercel project, a verification poll and
          a removal path, and half of that is a domain stuck in "verifying" with
          no way back. The read side ships; the write side lands with its own
          audit trail.
        */}
        <div className="mt-6 rounded-tile border border-dashed border-brand-ink/15 bg-white p-5">
          <p className="text-sm font-semibold">Your own domain</p>
          <p className="mt-1 text-sm text-brand-ink/55">
            Bringing a domain you already own is not wired up yet. Tell HQ which one and we
            will connect it by hand in the meantime.
          </p>
        </div>
      </div>
    </>
  );
}
