"use client";

import { useState } from "react";

function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        } catch {
          /* clipboard blocked */
        }
      }}
      className="ml-2 shrink-0 rounded border border-plum-ink/15 px-1.5 py-0.5 text-[10px] font-semibold text-plum-ink/60 hover:bg-cream"
    >
      {done ? "copied ✓" : "copy"}
    </button>
  );
}

function Value({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center">
      <code className="break-all rounded bg-cream px-1.5 py-0.5 text-[11px]">{text}</code>
      <Copy text={text} />
    </span>
  );
}

export interface DnsRecord {
  type: string;
  domain: string;
  value: string;
}

/**
 * Step-by-step guide for pointing a custom domain at the platform. Always shown
 * (even before a domain is connected) so owners know what they're getting into,
 * and shows the live DNS records once a domain is connected.
 */
export function DomainInstructions({
  domain,
  verified,
  records,
  aRecordIp = "76.76.21.21",
  cnameTarget = "cname.vercel-dns.com",
}: {
  domain: string | null;
  verified: boolean;
  records: DnsRecord[];
  aRecordIp?: string;
  cnameTarget?: string;
}) {
  // Apex (yourrestaurant.com) vs subdomain (order.yourrestaurant.com). Simple
  // label-count heuristic — we show both options anyway.
  const labels = domain ? domain.replace(/^https?:\/\//, "").split(".").length : 0;
  const isApex = labels > 0 && labels <= 2;

  return (
    <div className="rounded-tile border border-plum-ink/10 bg-white p-5">
      <h3 className="font-heading font-bold">How to connect your domain</h3>
      <ol className="mt-3 space-y-3 text-sm text-plum-ink/70">
        <li className="flex gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-xs font-bold text-brand-primary">1</span>
          <span>
            <span className="font-semibold text-plum-ink">Own a domain.</span> If you don&apos;t have
            one yet, buy it from a registrar (GoDaddy, Namecheap, Google Domains, etc.).
          </span>
        </li>
        <li className="flex gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-xs font-bold text-brand-primary">2</span>
          <span>
            <span className="font-semibold text-plum-ink">Enter it above &amp; click Connect.</span>{" "}
            Use a subdomain like <code className="rounded bg-cream px-1 text-[11px]">order.yourrestaurant.com</code>{" "}
            (recommended) or your root domain <code className="rounded bg-cream px-1 text-[11px]">yourrestaurant.com</code>.
          </span>
        </li>
        <li className="flex gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-xs font-bold text-brand-primary">3</span>
          <span>
            <span className="font-semibold text-plum-ink">Open your registrar&apos;s DNS settings</span>{" "}
            (look for &ldquo;DNS&rdquo;, &ldquo;Manage DNS&rdquo;, or &ldquo;Nameservers &amp; DNS&rdquo;)
            and add the record below.
          </span>
        </li>
        <li className="flex gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-xs font-bold text-brand-primary">4</span>
          <span>
            <span className="font-semibold text-plum-ink">Save, then come back and tap Refresh status.</span>{" "}
            DNS can take a few minutes (sometimes up to an hour). SSL/HTTPS is set up automatically —
            you don&apos;t need to do anything for the padlock.
          </span>
        </li>
      </ol>

      {/* The DNS records to add */}
      <div className="mt-5 rounded-lg border border-plum-ink/10 bg-cream/40 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-plum-ink/45">
          DNS record to add
        </p>

        {domain && verified ? (
          <p className="mt-2 text-sm font-semibold text-mango">
            ✓ {domain} is connected and live — nothing more to do.
          </p>
        ) : records.length > 0 ? (
          <>
            <p className="mt-1 text-xs text-plum-ink/55">
              Add exactly this at your registrar for <strong>{domain}</strong>:
            </p>
            <div className="mt-2 space-y-2">
              {records.map((r, i) => (
                <div key={i} className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm sm:grid-cols-[60px_1fr]">
                  <span className="text-plum-ink/45">Type</span>
                  <span className="font-semibold">{r.type}</span>
                  <span className="text-plum-ink/45">Name</span>
                  <Value text={r.domain} />
                  <span className="text-plum-ink/45">Value</span>
                  <Value text={r.value} />
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="mt-2 space-y-3 text-sm">
            <div className={isApex ? "opacity-50" : ""}>
              <p className="font-semibold text-plum-ink">
                For a subdomain {domain && !isApex ? `(${domain})` : "(e.g. order.yourrestaurant.com)"} — recommended
              </p>
              <p className="mt-1 text-plum-ink/65">
                Add a <strong>CNAME</strong> record · Name <Value text={domain && !isApex ? domain.split(".")[0] : "order"} /> · Value{" "}
                <Value text={cnameTarget} />
              </p>
            </div>
            <div className={!isApex && domain ? "opacity-50" : ""}>
              <p className="font-semibold text-plum-ink">
                For a root domain {domain && isApex ? `(${domain})` : "(e.g. yourrestaurant.com)"}
              </p>
              <p className="mt-1 text-plum-ink/65">
                Add an <strong>A</strong> record · Name <Value text="@" /> · Value <Value text={aRecordIp} />
              </p>
            </div>
            {!domain && (
              <p className="text-xs text-plum-ink/45">
                Connect a domain above and the exact record (with values to copy) will show here.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
