import { requireHqPage } from "@/server/hq/auth";
import { getEmailStatus } from "@/server/email/provider";
import { systemDb } from "@/server/tenancy/scoped-db";
import { HqShell } from "@/components/hq/HqShell";
import { HqEmailSettings } from "@/components/hq/HqEmailSettings";

export const metadata = { title: "Email · CANVEXIA HQ" };
export const dynamic = "force-dynamic";

/**
 * CANVEXIA's sending credentials, in CANVEXIA's own console.
 *
 * This screen exists because the only one before it lived under Servd's
 * `/super-admin` — so setting up the key that sends CANVEXIA's partner
 * invitations meant signing into a different product's admin.
 */
export default async function HqEmailPage() {
  const user = await requireHqPage("settings.email");
  const status = await getEmailStatus();

  // How much is waiting, and how much has given up — the two numbers that say
  // whether the configuration on this page is actually working.
  const [queued, parked] = await systemDb(async (tx) => [
    await tx.outboundEmail.count({ where: { sentAt: null, failedAt: null } }),
    await tx.outboundEmail.count({ where: { failedAt: { not: null } } }),
  ]).catch(() => [0, 0]);

  const lastError = await systemDb((tx) =>
    tx.outboundEmail.findFirst({
      where: { error: { not: null }, sentAt: null },
      orderBy: { createdAt: "desc" },
      select: { error: true },
    }),
  ).catch(() => null);

  return (
    <HqShell
      user={user}
      title="Email"
      subtitle="The account every CANVEXIA and Servd email is sent through."
    >
      <HqEmailSettings
        status={status}
        queued={queued}
        parked={parked}
        lastError={lastError?.error ?? null}
      />
    </HqShell>
  );
}
