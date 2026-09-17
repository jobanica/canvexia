"use server";

import { revalidatePath } from "next/cache";
import { requireWritablePartner } from "@/server/partners/auth";
import { systemDb } from "@/server/tenancy/scoped-db";
import { writeSeatAudit } from "@/server/audit/log";
import { normaliseHost } from "@/lib/partners/custom-host";
import { getDomainProvider } from "@/server/domains";
import { toState } from "@/server/partners/domains";

export type DomainRequestState = { ok?: string; error?: string } | null;

/**
 * Ask for a domain you already own.
 *
 * A REQUEST, not an attach. Adding a domain is a write to the hosting project
 * with a credential this deployment does not carry, so claiming it is self-serve
 * would leave a partner watching a "verifying" chip that nothing is driving.
 * What the partner can do now — point their DNS — they are told exactly how to
 * do, and HQ finishes it.
 */
export async function requestCustomDomain(
  _prev: DomainRequestState,
  formData: FormData,
): Promise<DomainRequestState> {
  const who = await requireWritablePartner("domains.write");
  if (!who) return { error: "Your seat can't change domains." };

  const host = normaliseHost(String(formData.get("host") ?? ""));
  if (!host) return { error: "Enter a domain, like order.yourshop.ph" };

  // Somebody else's, or ours. Both are refusals rather than a support ticket
  // three days later about a domain that could never have worked.
  const taken = await systemDb((tx) =>
    tx.partner.findFirst({
      where: { customDomain: host, NOT: { id: who.partnerId } },
      select: { id: true },
    }),
  ).catch(() => null);
  if (taken) return { error: "That domain is already claimed by another account." };

  const reserved = process.env.NEXT_PUBLIC_PARTNER_ROOT_DOMAIN ?? "canvexia.com";
  if (host === reserved || host.endsWith(`.${reserved}`)) {
    return { error: `${reserved} addresses are handed out automatically — use your own domain here.` };
  }

  /**
   * ATTACH IT FOR REAL when the platform has a domain provider, and record
   * "requested" when it does not.
   *
   * Both are honest states. `getDomainProvider()` returns null without
   * VERCEL_TOKEN and VERCEL_PROJECT_ID, and on a deployment without them the
   * only true thing to say is that somebody will finish this by hand. With
   * them, the attach happens now and the verification records come back from
   * the host rather than from a constant in our UI — which is the difference
   * between instructions that are right and instructions that were right when
   * they were written.
   */
  const provider = getDomainProvider();
  let state = "requested";
  if (provider) {
    const added = await provider.addDomain(host).catch(() => ({ ok: false, error: "" }));
    // "already exists" on THIS project is success — a partner re-submitting the
    // same domain should land on the DNS instructions, not on an error.
    if (!added.ok && !/already|exists/i.test(added.error ?? "")) {
      return { error: added.error || "The host refused that domain. Check the spelling." };
    }
    const status = await provider.getStatus(host).catch(() => null);
    state = status?.verified ? "active" : "dns_pending";
  }

  try {
    await systemDb(async (tx) => {
      await tx.partner.update({
        where: { id: who.partnerId },
        data: { customDomain: host, customDomainState: state },
        select: { id: true },
      });
      await writeSeatAudit(tx, who, {
        action: "partner.custom_domain_requested",
        entityType: "partner",
        entityId: who.partnerId,
        after: { customDomain: host },
      });
    });
  } catch {
    return { error: "Couldn't save that. Try again." };
  }

  revalidatePath("/partner/domains");
  return {
    ok:
      state === "active"
        ? "Connected. It is live now."
        : provider
          ? "Added. Point your DNS using the records below, then tap Check."
          : "Saved. Add the record below, then tell us — we will switch it on.",
  };
}

/** Withdraw the request, for a domain somebody changed their mind about. */
export async function clearCustomDomain(
  _prev: DomainRequestState,
  _formData: FormData,
): Promise<DomainRequestState> {
  const who = await requireWritablePartner("domains.write");
  if (!who) return { error: "Your seat can't change domains." };
  try {
    const current = await systemDb((tx) =>
      tx.partner.findUnique({ where: { id: who.partnerId }, select: { customDomain: true } }),
    );
    // Detach from the host too. Forgetting it here while leaving it attached
    // would hold the name against the project so nobody — including this
    // partner — could add it again.
    const provider = getDomainProvider();
    if (provider && current?.customDomain) {
      await provider.removeDomain(current.customDomain).catch(() => {});
    }
    await systemDb((tx) =>
      tx.partner.update({
        where: { id: who.partnerId },
        data: { customDomain: null, customDomainState: null },
        select: { id: true },
      }),
    );
  } catch {
    return { error: "Couldn't do that. Try again." };
  }
  revalidatePath("/partner/domains");
  return { ok: "Removed." };
}


/**
 * Ask the host whether the DNS has landed yet.
 *
 * A BUTTON, NOT A POLLER. DNS takes minutes or hours and the person waiting
 * knows when they changed it; a background poll would either hammer the host's
 * API for every partner forever or run too rarely to feel responsive. One tap,
 * when they are ready, is both cheaper and faster.
 */
export async function refreshCustomDomain(
  _prev: DomainRequestState,
  _formData: FormData,
): Promise<DomainRequestState> {
  const who = await requireWritablePartner("domains.write");
  if (!who) return { error: "Your seat can't change domains." };

  const provider = getDomainProvider();
  if (!provider) {
    return { error: "Checking is not available on this deployment yet — we verify by hand." };
  }

  const current = await systemDb((tx) =>
    tx.partner.findUnique({ where: { id: who.partnerId }, select: { customDomain: true } }),
  ).catch(() => null);
  if (!current?.customDomain) return { error: "No domain to check." };

  const status = await provider.getStatus(current.customDomain).catch(() => null);
  const state = status?.verified ? "active" : toState(status) === "error" ? "requested" : "dns_pending";

  await systemDb((tx) =>
    tx.partner.update({
      where: { id: who.partnerId },
      data: { customDomainState: state },
      select: { id: true },
    }),
  ).catch(() => {});

  revalidatePath("/partner/domains");
  return state === "active"
    ? { ok: "Connected. Your certificate is issued automatically — give it a minute." }
    : { ok: "Not visible yet. DNS usually spreads in minutes, sometimes a few hours." };
}
