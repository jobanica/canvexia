import "server-only";
import { getDomainProvider } from "@/server/domains";
import type { DomainStatus } from "@/server/domains/provider";

/**
 * A partner's domains.
 *
 * Reuses the `DomainProvider` interface the restaurant custom-domain feature
 * already goes through, rather than calling Vercel here. The brief asked
 * whether credentials exist and to stub the call if not — they do exist, and
 * the stub already exists too: `getDomainProvider()` returns null when
 * VERCEL_TOKEN or VERCEL_PROJECT_ID is unset, and every caller treats that as
 * "not configured" rather than crashing.
 *
 * THE DEFAULT SUBDOMAIN IS NOT A DOMAIN YET. `{slug}.canvexia.com` is listed
 * and cannot be removed, but it is marked *planned*, because canvexia.com is
 * NXDOMAIN — no domain in this project resolves (docs/canvexia/domains.md).
 * Showing it as active would be the portal asserting something a DNS lookup
 * disproves.
 */
export type DomainState = "planned" | "pending" | "verifying" | "active" | "error";

export interface PartnerDomain {
  host: string;
  state: DomainState;
  /** DNS records the partner has to add. Empty once verified. */
  records: { type: string; name: string; value: string }[];
  removable: boolean;
  note?: string;
}

const ROOT = process.env.NEXT_PUBLIC_PARTNER_ROOT_DOMAIN ?? "canvexia.com";

export function defaultHostFor(slug: string | null): string | null {
  return slug ? `${slug}.${ROOT}` : null;
}

export async function listPartnerDomains(slug: string | null): Promise<PartnerDomain[]> {
  const out: PartnerDomain[] = [];

  const fallback = defaultHostFor(slug);
  if (fallback) {
    out.push({
      host: fallback,
      state: "planned",
      records: [],
      removable: false,
      note: `${ROOT} is not registered yet. This becomes your address the day it is.`,
    });
  }

  return out;
}

/** Translate a provider status into the five states the UI knows. */
export function toState(status: DomainStatus | null): DomainState {
  if (!status) return "error";
  if (status.verified) return "active";
  return status.verification.length > 0 ? "pending" : "verifying";
}

export async function domainStatus(host: string): Promise<{
  state: DomainState;
  records: { type: string; name: string; value: string }[];
  configured: boolean;
}> {
  const provider = getDomainProvider();
  if (!provider) {
    // Not an error state: the platform simply has no domain provider wired in
    // this environment, and saying "error" would send a partner chasing DNS
    // that is not the problem.
    return { state: "verifying", records: [], configured: false };
  }
  const status = await provider.getStatus(host).catch(() => null);
  return {
    state: toState(status),
    records: (status?.verification ?? []).map((v) => ({
      type: v.type,
      name: v.domain,
      value: v.value,
    })),
    configured: true,
  };
}
