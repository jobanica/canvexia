import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { PrintSettingsForm } from "@/components/admin/PrintSettingsForm";
import { drawerPolicy, type DrawerPolicy } from "@/lib/printing/drawer";
import { bpToPercentString, parsePrinterConfig } from "@/lib/printing/printer-config";

export default async function PrintingSettingsPage() {
  const { restaurantId } = await requireAdminPage();

  const restaurant = await tenantDb(restaurantId, (tx) =>
    tx.restaurant.findFirstOrThrow({
      select: { id: true, printMethod: true, autoPrint: true, printerConfig: true },
    }),
  );

  // kitchenDisplay is read separately so a lagging column can't break the page.
  let kitchenDisplay = true;
  try {
    const k = await tenantDb(restaurantId, (tx) =>
      tx.restaurant.findFirst({ select: { kitchenDisplay: true } }),
    );
    kitchenDisplay = k?.kitchenDisplay ?? true;
  } catch {
    /* not migrated yet */
  }

  // Same treatment for the settle-time settings.
  let autoPrintReceipt = true;
  let openDrawerOn: DrawerPolicy = "cash";
  try {
    const s = await tenantDb(restaurantId, (tx) =>
      tx.restaurant.findFirst({ select: { autoPrintReceipt: true, openDrawerOn: true } }),
    );
    autoPrintReceipt = s?.autoPrintReceipt ?? true;
    openDrawerOn = drawerPolicy(s?.openDrawerOn);
  } catch {
    /* not migrated yet */
  }

  const cfg = parsePrinterConfig(restaurant.printerConfig);
  const receipt = cfg.receipt;
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const pollUrl = (token: string | null) =>
    token ? `${base}/api/print/cloud/${restaurant.id}?token=${token}` : null;
  const cloudPollUrl = pollUrl(cfg.pollToken);
  // The kitchen printer polls with its OWN token, which is how the endpoint
  // knows to hand it dockets rather than the till's receipts.
  const kitchenPollUrl = pollUrl(cfg.kitchen.pollToken);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-plum-ink/50">
          ← Dashboard
        </Link>
        <h1 className="font-heading text-2xl font-bold">Printer settings</h1>
        <p className="text-sm text-plum-ink/50">
          Choose how kitchen tickets print. The method is pluggable per
          restaurant.
        </p>
      </div>

      <PrintSettingsForm
        initial={{
          printMethod: restaurant.printMethod,
          autoPrint: restaurant.autoPrint,
          kitchenDisplay,
          bridgeUrl: cfg.bridgeUrl ?? "",
          receiptAddress: receipt.address ?? "",
          receiptPhone: receipt.phone ?? "",
          receiptWebsite: receipt.website ?? "",
          receiptFooter: receipt.footer ?? "",
          receiptShowVat: receipt.showVat,
          receiptShowCustomer: receipt.showCustomer,
          receiptShowCashTendered: receipt.showCashTendered,
          kitchenShowAddress: cfg.kitchen.showAddress,
          kitchenSeparate: cfg.kitchen.separate,
          kitchenMethod: cfg.kitchen.method ?? "network",
          kitchenBridgeUrl: cfg.kitchen.bridgeUrl ?? "",
          cardSurchargePercent: bpToPercentString(cfg.payments.cardSurchargeBp),
          payFirst: cfg.payments.payFirst,
          autoPrintReceipt,
          openDrawerOn,
        }}
        cloudPollUrl={cloudPollUrl}
        kitchenPollUrl={kitchenPollUrl}
      />
    </div>
  );
}
