import Link from "next/link";
import { getOrCreateBrand } from "@/server/content/brand";
import { contentEngineEnabled } from "@/server/content/claude";
import { usageSummary, DAILY_CAP } from "@/server/content/usage";

export const metadata = { title: "Content Engine · Servd" };

const SECTIONS = [
  {
    href: "/super-admin/content-engine/generate",
    title: "Generate",
    desc: "Create a single Taglish script — jab or right hook.",
    ready: true,
  },
  {
    href: "/super-admin/content-engine/batch",
    title: "Batch",
    desc: "Generate a J-J-J-H set for the week.",
    ready: true,
  },
  {
    href: "/super-admin/content-engine/calendar",
    title: "Calendar",
    desc: "Schedule posts and eyeball the jab/hook ratio.",
    ready: true,
  },
  {
    href: "/super-admin/content-engine/library",
    title: "Library",
    desc: "All scripts, performance, and remix winners.",
    ready: true,
  },
  {
    href: "/super-admin/content-engine/settings",
    title: "Settings",
    desc: "Edit the brand voice, jab ratio, and pillars.",
    ready: true,
  },
];

export default async function ContentEnginePage() {
  const brand = await getOrCreateBrand();
  const enabled = contentEngineEnabled();
  const usage = await usageSummary(30);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Content Engine</h1>
        <p className="max-w-2xl text-sm text-plum-ink/50">
          Servd&apos;s own short-form marketing scripts — Taglish, built on Jab, Jab, Jab, Right
          Hook. Internal tool, super-admin only.
        </p>
      </div>

      {!brand && (
        <div className="rounded-tile border border-mango/40 bg-mango/10 p-4 text-sm text-plum-ink">
          Setup needed: run{" "}
          <code className="rounded bg-white px-1">prisma/manual/add-content-engine.sql</code> in the
          Supabase SQL editor to create the tables.
        </div>
      )}
      {brand && !enabled && (
        <div className="rounded-tile border border-plum-ink/15 bg-white p-4 text-sm text-plum-ink/70">
          Set the <span className="font-semibold">Claude API key</span> on the server to enable
          generation.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((s) =>
          s.ready ? (
            <Link
              key={s.title}
              href={s.href}
              className="rounded-tile border border-plum-ink/10 bg-white p-5 transition hover:border-brand-primary hover:shadow-md"
            >
              <p className="font-heading text-lg font-bold">{s.title}</p>
              <p className="mt-1 text-sm text-plum-ink/55">{s.desc}</p>
            </Link>
          ) : (
            <div
              key={s.title}
              className="rounded-tile border border-dashed border-plum-ink/10 bg-white/50 p-5 opacity-70"
            >
              <p className="font-heading text-lg font-bold text-plum-ink/60">
                {s.title}{" "}
                <span className="ml-1 rounded-full bg-plum-ink/5 px-2 py-0.5 text-[10px] font-semibold text-plum-ink/45">
                  soon
                </span>
              </p>
              <p className="mt-1 text-sm text-plum-ink/45">{s.desc}</p>
            </div>
          ),
        )}
      </div>

      {brand && (
        <div className="rounded-tile border border-plum-ink/10 bg-white p-5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-plum-ink/40">
            Usage (last 30 days)
          </p>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <p className="font-heading text-2xl font-bold">{usage.count}</p>
              <p className="text-xs text-plum-ink/50">generations</p>
            </div>
            <div>
              <p className="font-heading text-2xl font-bold">
                {usage.today}
                <span className="text-sm font-normal text-plum-ink/40"> / {DAILY_CAP}</span>
              </p>
              <p className="text-xs text-plum-ink/50">today (cap)</p>
            </div>
            <div>
              <p className="font-heading text-2xl font-bold">{(usage.inputTokens / 1000).toFixed(1)}k</p>
              <p className="text-xs text-plum-ink/50">input tokens</p>
            </div>
            <div>
              <p className="font-heading text-2xl font-bold">{(usage.outputTokens / 1000).toFixed(1)}k</p>
              <p className="text-xs text-plum-ink/50">output tokens</p>
            </div>
          </div>
        </div>
      )}

      {brand && (
        <div className="rounded-tile border border-plum-ink/10 bg-white p-5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-plum-ink/40">
            Active pillars
          </p>
          <div className="mt-2 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-semibold text-sky-700">Jabs (value)</p>
              <ul className="space-y-0.5 text-sm text-plum-ink/70">
                {brand.pillars
                  .filter((p) => p.kind === "JAB" && p.active)
                  .map((p) => (
                    <li key={p.id}>· {p.name}</li>
                  ))}
              </ul>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold text-brand-primary">Right hooks (ask)</p>
              <ul className="space-y-0.5 text-sm text-plum-ink/70">
                {brand.pillars
                  .filter((p) => p.kind === "RIGHT_HOOK" && p.active)
                  .map((p) => (
                    <li key={p.id}>· {p.name}</li>
                  ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
