"use server";

import { revalidatePath } from "next/cache";
import { requireWritablePartner } from "@/server/partners/auth";
import { systemDb } from "@/server/tenancy/scoped-db";
import { writeSeatAudit } from "@/server/audit/log";
import { normaliseHost } from "@/lib/partners/custom-host";

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

  try {
    await systemDb(async (tx) => {
      await tx.partner.update({
        where: { id: who.partnerId },
        data: { customDomain: host, customDomainState: "requested" },
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
  return { ok: "Saved. Add the two records below, then tell us — we will switch it on." };
}

/** Withdraw the request, for a domain somebody changed their mind about. */
export async function clearCustomDomain(
  _prev: DomainRequestState,
  _formData: FormData,
): Promise<DomainRequestState> {
  const who = await requireWritablePartner("domains.write");
  if (!who) return { error: "Your seat can't change domains." };
  try {
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
