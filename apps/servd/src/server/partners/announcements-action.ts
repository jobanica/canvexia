"use server";

import { revalidatePath } from "next/cache";
import { systemDb } from "@/server/tenancy/scoped-db";
import { getCurrentPartner } from "./auth";

/**
 * Mark an HQ announcement read.
 *
 * Deliberately NOT behind `requireWritablePartner`: an HQ "view as" session
 * looking at a partner's portal must not clear that partner's notices — HQ
 * reading it is not the partner reading it, and the receipt is what HQ uses to
 * decide whether to chase somebody. So the impersonation check refuses, and the
 * refusal is silent because there is nothing useful to tell HQ here.
 *
 * `systemDb` because the write is to a partner-scoped table under a partner's
 * own id, and the read receipt is not something a partner can get wrong: the
 * unique index on (announcementId, partnerId) is what makes a second click a
 * no-op rather than a duplicate.
 */
export async function markAnnouncementReadAction(formData: FormData): Promise<void> {
  const announcementId = String(formData.get("id") ?? "").trim();
  if (!announcementId) return;

  const partner = await getCurrentPartner();
  if (!partner || partner.impersonatedBy) return;

  try {
    await systemDb((tx) =>
      tx.hqAnnouncementRead.upsert({
        where: { announcementId_partnerId: { announcementId, partnerId: partner.id } },
        create: { announcementId, partnerId: partner.id, partnerUserId: partner.user.id },
        update: {},
      }),
    );
  } catch {
    /* not migrated yet, or already read — either way there is nothing to say */
  }
  revalidatePath("/partner");
}
