import Link from "next/link";
import { requireSuperAdminPage } from "@/server/tenancy/require-admin";
import { getFunnel } from "@/server/build/funnel";
import { getLandingConfig } from "@/server/landing/settings";
import { LandingVideoForm } from "@/components/super-admin/LandingVideoForm";

export const dynamic = "force-dynamic";

function pct(n: number, of: number): string {
  if (of <= 0) return "—";
  return `${Math.round((n / of) * 100)}%`;
}

/**
 * DIY funnel. The self-serve path only earns more ad spend once it converts
 * better than the manual one, so this puts both numbers side by side and shows
 * exactly which step is leaking.
 */
export default async function FunnelPage() {
  await requireSuperAdminPage();
  const [f, landing] = await Promise.all([getFunnel(14), getLandingConfig()]);
  const t = f.totals;

  const stages = [
    { label: "Builds started", value: t.started, of: t.started },
    { label: "Reached preview", value: t.reachedPreview, of: t.started },
    { label: "Activation requested", value: t.requested, of: t.reachedPreview },
    { label: "Activated (paid)", value: t.activated, of: t.requested },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">DIY funnel</h1>
        <p className="text-sm text-plum-ink/50">
          Last 14 days of the self-serve builder at <span className="font-mono">/build</span>.
        </p>
      </div>

      {/* Stage counts + step-to-step conversion */}
      <div className="grid gap-3 sm:grid-cols-4">
        {stages.map((s, i) => (
          <div key={s.label} className="rounded-tile border border-plum-ink/10 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-plum-ink/45">
              {s.label}
            </p>
            <p className="font-heading text-3xl font-extrabold text-plum-ink">{s.value}</p>
            {i > 0 && (
              <p className="text-xs text-plum-ink/45">{pct(s.value, s.of)} of the step before</p>
            )}
          </div>
        ))}
      </div>

      {/* Which intake path is actually producing accounts */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-tile border border-plum-ink/10 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-plum-ink/45">
            New accounts — manual onboarding
          </p>
          <p className="font-heading text-3xl font-extrabold text-plum-ink">{f.manualAccounts}</p>
        </div>
        <div className="rounded-tile border border-brand-primary/30 bg-brand-primary/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-plum-ink/45">
            New accounts — DIY
          </p>
          <p className="font-heading text-3xl font-extrabold text-brand-primary">{f.diyAccounts}</p>
        </div>
      </div>

      <LandingVideoForm initial={landing.videoUrl} />

      {/* The ad report. Sorted by activations, because that's the only column
          that decides whether a creative keeps its budget — a cheap click that
          never becomes a restaurant is a cost, not a result. */}
      {f.byUtm.length > 0 && (
        <div className="overflow-x-auto rounded-tile border border-plum-ink/10 bg-white">
          <div className="px-4 pt-4">
            <h2 className="font-heading text-lg font-bold">By ad · last 14 days</h2>
            <p className="text-sm text-plum-ink/50">
              From the <span className="font-mono">/create</span> landing page through to a paid
              activation. Tag your Facebook ad links with{" "}
              <span className="font-mono text-xs">utm_source</span> /{" "}
              <span className="font-mono text-xs">utm_campaign</span> /{" "}
              <span className="font-mono text-xs">utm_content</span> to split them out here.
            </p>
          </div>
          <table className="mt-3 w-full min-w-[640px] text-sm">
            <thead className="bg-cream/60 text-left text-xs uppercase tracking-wide text-plum-ink/45">
              <tr>
                <th className="px-4 py-2">Ad</th>
                <th className="px-4 py-2">Views</th>
                <th className="px-4 py-2">CTA taps</th>
                <th className="px-4 py-2">Started</th>
                <th className="px-4 py-2">Preview</th>
                <th className="px-4 py-2">Activated</th>
                <th className="px-4 py-2">View → paid</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-plum-ink/5">
              {f.byUtm.map((u) => (
                <tr key={u.label}>
                  <td className="px-4 py-2 font-semibold">{u.label}</td>
                  <td className="px-4 py-2">{u.views}</td>
                  <td className="px-4 py-2">{u.ctaClicks}</td>
                  <td className="px-4 py-2">{u.started}</td>
                  <td className="px-4 py-2">{u.reachedPreview}</td>
                  <td className="px-4 py-2 font-semibold text-brand-primary">{u.activated}</td>
                  <td className="px-4 py-2 text-xs text-plum-ink/50">
                    {pct(u.activated, u.views)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Per-day detail */}
      <div className="overflow-x-auto rounded-tile border border-plum-ink/10 bg-white">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="bg-cream/60 text-left text-xs uppercase tracking-wide text-plum-ink/45">
            <tr>
              <th className="px-4 py-2">Day</th>
              <th className="px-4 py-2">Started</th>
              <th className="px-4 py-2">Preview</th>
              <th className="px-4 py-2">Requested</th>
              <th className="px-4 py-2">Activated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-plum-ink/5">
            {f.days.map((d) => (
              <tr key={d.day}>
                <td className="px-4 py-2 font-mono text-xs">{d.day}</td>
                <td className="px-4 py-2">{d.started}</td>
                <td className="px-4 py-2">{d.reachedPreview}</td>
                <td className="px-4 py-2">{d.requested}</td>
                <td className="px-4 py-2 font-semibold text-brand-primary">{d.activated}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Rescue path: owners who paid on a device that isn't the one they
          built on can't be shown the claim link automatically. */}
      {f.unclaimed.length > 0 && (
        <div className="rounded-tile border border-mango/40 bg-mango/5 p-4">
          <h2 className="font-heading text-lg font-bold">Paid — password not set yet</h2>
          <p className="text-sm text-plum-ink/50">
            Send them this one-time link. It stops working once they use it.
          </p>
          <ul className="mt-3 space-y-2">
            {f.unclaimed.map((u) => (
              <li key={u.claimUrl} className="text-sm">
                <span className="font-semibold">{u.name}</span>
                {u.username && (
                  <span className="ml-2 font-mono text-xs text-plum-ink/50">{u.username}</span>
                )}
                <span className="mt-0.5 block break-all font-mono text-xs text-brand-primary">
                  {u.claimUrl}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* The warm-lead list — the whole reason contact is captured up front */}
      <div className="rounded-tile border border-plum-ink/10 bg-white p-4">
        <h2 className="font-heading text-lg font-bold">Warm leads — built but never paid</h2>
        <p className="text-sm text-plum-ink/50">
          They did the data entry themselves. Message them.
        </p>
        {f.openLeads.length === 0 ? (
          <p className="mt-3 text-sm text-plum-ink/45">No open previews right now.</p>
        ) : (
          <ul className="mt-3 divide-y divide-plum-ink/5">
            {f.openLeads.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                <Link
                  href={`/preview/${l.slug}`}
                  className="font-semibold text-brand-primary hover:underline"
                >
                  {l.name}
                </Link>
                <span className="text-xs text-plum-ink/45">{l.items} items</span>
                {l.requested ? (
                  <span className="rounded-full bg-mango/15 px-2 py-0.5 text-xs font-semibold text-mango">
                    started payment
                  </span>
                ) : l.reachedPreview ? (
                  <span className="rounded-full bg-plum-ink/5 px-2 py-0.5 text-xs font-semibold text-plum-ink/50">
                    saw preview
                  </span>
                ) : null}
                <span className="ml-auto text-right text-xs text-plum-ink/60">
                  {l.contactEmail && <span className="block">{l.contactEmail}</span>}
                  <span className="block text-plum-ink/40">
                    {l.contactPhone || l.contactFb || (l.contactEmail ? "" : "no contact")}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
