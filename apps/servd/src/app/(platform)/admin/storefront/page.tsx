import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { featureLockOr } from "@/server/billing/feature-lock-gate";
import { getStorefront } from "@/server/storefront/storefront";
import { StorefrontForm } from "@/components/admin/StorefrontForm";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { qrPngDataUrl } from "@/lib/qr";
import { CopyLink } from "@/components/super-admin/CopyLink";
import { OnlineOrderingToggle } from "@/components/admin/OnlineOrderingToggle";
import { AutoAcceptToggle } from "@/components/admin/AutoAcceptToggle";

export default async function StorefrontPage() {
  const { restaurantId } = await requireAdminPage();
  const locked = await featureLockOr(restaurantId, "onlineOrdering", "Online ordering");
  if (locked) return locked;
  const sf = await getStorefront(restaurantId);

  // Public ordering-website URL — prefer a verified custom domain, else the
  // platform path. Domain columns are read best-effort.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.servdph.com";
  let r: { slug: string; customDomain?: string | null; customDomainVerifiedAt?: Date | null } | null = null;
  try {
    r = await tenantDb(restaurantId, (tx) =>
      tx.restaurant.findFirst({ select: { slug: true, customDomain: true, customDomainVerifiedAt: true } }),
    );
  } catch {
    r = await tenantDb(restaurantId, (tx) => tx.restaurant.findFirst({ select: { slug: true } }));
  }
  const url =
    r?.customDomain && r.customDomainVerifiedAt
      ? `https://${r.customDomain}`
      : `${appUrl}/r/${r?.slug ?? ""}`;
  const qr = await qrPngDataUrl(url);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-plum-ink/50">← Dashboard</Link>
        <h1 className="font-heading text-2xl font-bold">Online website</h1>
        <p className="text-sm text-plum-ink/50">Store hours and delivery zones shown on your public ordering site.</p>
      </div>

      {/* Above everything: it's the one control here that gets used mid-service. */}
      <OnlineOrderingToggle paused={sf.ordersPaused} />

      {/* The other "how does the shop behave when the counter is busy" decision. */}
      <AutoAcceptToggle seconds={sf.autoAcceptSeconds} />

      {/* Website QR — print it, post it, send it to customers */}
      <div className="rounded-tile border border-brand-primary/20 bg-brand-primary/5 p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-plum-ink/45">Your ordering website</p>
            <p className="mt-1 break-all font-mono text-sm text-brand-primary">{url}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg bg-brand-gradient px-3 py-1.5 text-xs font-semibold text-white"
              >
                Open website ↗
              </a>
              <CopyLink url={url} />
            </div>
            <p className="mt-2 text-xs text-plum-ink/50">
              Print the QR for your storefront, table tents or flyers — customers scan it to order
              online (0% commission).
            </p>
          </div>
          <div className="shrink-0 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="Website QR code" className="h-40 w-40 rounded-lg border border-plum-ink/10 bg-white p-2" />
            <a
              href={qr}
              download={`${r?.slug ?? "website"}-qr.png`}
              className="mt-2 inline-block rounded-lg border border-plum-ink/15 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-cream"
            >
              ⬇ Download QR
            </a>
          </div>
        </div>
      </div>

      <StorefrontForm
        initial={{
          hours: sf.hours,
          zones: sf.zones.map((z) => ({ name: z.name, feePesos: z.fee / 100 })),
          pauseWhenClosed: sf.pauseWhenClosed,
          acceptsBookings: sf.acceptsBookings,
          booking: {
            requireDownpayment: sf.booking.requireDownpayment,
            downpaymentType: sf.booking.downpaymentType,
            // Fixed amounts are stored in centavos — show pesos in the input.
            downpaymentValue: sf.booking.downpaymentType === "fixed" ? sf.booking.downpaymentValue / 100 : sf.booking.downpaymentValue,
            downpaymentInstructions: sf.booking.downpaymentInstructions,
          },
          payment: {
            codEnabled: sf.payment.codEnabled,
            codFeeEnabled: sf.payment.codFeeEnabled,
            codFeePesos: sf.payment.codFee / 100,
            gcashEnabled: sf.payment.gcashEnabled,
            gcashName: sf.payment.gcashName,
            gcashNumber: sf.payment.gcashNumber,
            gcashQrUrl: sf.payment.gcashQrUrl,
            mayaEnabled: sf.payment.mayaEnabled,
            mayaName: sf.payment.mayaName,
            mayaNumber: sf.payment.mayaNumber,
            mayaQrUrl: sf.payment.mayaQrUrl,
            bankEnabled: sf.payment.bankEnabled,
            bankName: sf.payment.bankName,
            bankNumber: sf.payment.bankNumber,
            bankQrUrl: sf.payment.bankQrUrl,
            packagingFeeEnabled: sf.payment.packagingFeeEnabled,
            packagingFeePesos: sf.payment.packagingFee / 100,
            packagingFeeScope: sf.payment.packagingFeeScope,
            packagingFeeMode: sf.payment.packagingFeeMode,
            requireReceipt: sf.payment.requireReceipt,
            showVat: sf.payment.showVat,
          },
          delivery: {
            mode: sf.delivery.mode,
            baseFeePesos: sf.delivery.baseFee / 100,
            perKmPesos: sf.delivery.perKm / 100,
            freeKm: sf.delivery.freeKm,
            minFeePesos: sf.delivery.minFee / 100,
            maxKm: sf.delivery.maxKm,
            roadFactor: sf.delivery.roadFactor,
            originLat: sf.delivery.originLat,
            originLng: sf.delivery.originLng,
            feeInTotal: sf.delivery.feeInTotal,
            mapEnabled: sf.delivery.mapEnabled,
            selfBookRider: sf.delivery.selfBookRider,
            selfBookRiderNote: sf.delivery.selfBookRiderNote,
            fulfillment: sf.delivery.fulfillment,
          },
        }}
      />
    </div>
  );
}
