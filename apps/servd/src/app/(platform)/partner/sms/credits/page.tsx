import { CREDIT_PACKS, pesos } from "@servd/core";
import { requirePartnerPageWith } from "@/server/partners/auth";
import { getWallet, ledger } from "@/server/partners/sms-wallet";
import { recentTopUps } from "@/server/partners/sms-topup";
import { PortalShell } from "@/components/partner/PortalShell";
import { SmsCredits } from "@/components/partner/SmsCredits";

export const metadata = { title: "SMS credits · CANVEXIA" };
export const dynamic = "force-dynamic";

/**
 * The wallet.
 *
 * Readable by anybody who may send — they are the ones who find out the hard
 * way when it is empty — but only the partner admin may buy, which the action
 * enforces rather than this page.
 */
export default async function SmsCreditsPage({
  searchParams,
}: {
  searchParams: Promise<{ paid?: string }>;
}) {
  const partner = await requirePartnerPageWith("sms.send");
  const q = await searchParams;

  const [wallet, movements, topUps] = await Promise.all([
    getWallet(partner.id),
    ledger(partner.id),
    recentTopUps(partner.id),
  ]);

  return (
    <PortalShell
      partner={partner}
      title="SMS credits"
      subtitle="One credit is one message segment. A long text costs more than one."
    >
      <SmsCredits
        wallet={wallet}
        packs={CREDIT_PACKS.map((p) => ({
          credits: p.credits,
          price: pesos(p.priceCentavos),
        }))}
        movements={movements}
        topUps={topUps.map((t) => ({
          id: t.id,
          credits: t.credits,
          price: pesos(t.amountCentavos),
          status: t.status,
          createdAt: t.createdAt,
        }))}
        isAdmin={partner.user.role === "admin"}
        /* The gateway redirects here after payment. The webhook is what
           credits the wallet, so this only explains the wait — claiming the
           credits had landed would be a lie roughly half the time. */
        justPaid={q.paid === "1"}
      />
    </PortalShell>
  );
}
