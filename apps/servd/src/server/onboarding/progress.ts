import { tenantDb } from "@/server/tenancy/scoped-db";

export interface OnboardingStep {
  key: string;
  label: string;
  href: string;
  done: boolean;
}

export interface OnboardingState {
  steps: OnboardingStep[];
  doneCount: number;
  total: number;
  completedAt: Date | null;
}

/**
 * Derives onboarding progress from REAL data (not a stored step counter), so it
 * can never drift out of sync with what the restaurant has actually set up.
 */
export async function getOnboardingState(
  restaurantId: string,
): Promise<OnboardingState> {
  return tenantDb(restaurantId, async (tx) => {
    const r = await tx.restaurant.findFirstOrThrow({
      select: {
        onboardingCompletedAt: true,
        logoUrl: true,
        brandPrimaryColor: true,
        printerConfig: true,
      },
    });
    // The owner has "chosen a printer method" once they save the printing form,
    // which stamps printerConfig.configured. (displayName is auto-filled at
    // signup, so it can't count as a real branding action.)
    const printerConfigured =
      !!(r.printerConfig as { configured?: boolean } | null)?.configured;

    // Any one of the three manual QR methods being live counts as "set up".
    // They live in the storefront's paymentConfig JSON. Best-effort: an
    // onboarding checklist must never be the thing that breaks the dashboard.
    let payQrReady = false;
    try {
      const sf = await tx.storefrontSetting.findFirst({
        where: { restaurantId },
        select: { paymentConfig: true },
      });
      const pay = (sf?.paymentConfig ?? {}) as {
        gcashEnabled?: boolean;
        mayaEnabled?: boolean;
        bankEnabled?: boolean;
      };
      payQrReady = !!(pay.gcashEnabled || pay.mayaEnabled || pay.bankEnabled);
    } catch {
      /* not migrated yet — the step just reads as not done */
    }
    const [itemCount, tableCount] = await Promise.all([
      tx.menuItem.count(),
      tx.table.count(),
    ]);

    const steps: OnboardingStep[] = [
      {
        key: "branding",
        label: "Add your branding",
        href: "/admin/branding",
        done: !!(r.logoUrl || r.brandPrimaryColor),
      },
      {
        key: "menu",
        label: "Create your first menu item",
        href: "/admin/menu",
        done: itemCount > 0,
      },
      {
        key: "tables",
        label: "Add a table & print its QR",
        href: "/admin/tables",
        done: tableCount > 0,
      },
      {
        // Was "connect a payment gateway", pointing at PayMongo/Xendit setup.
        // Customers pay by scanning the shop's own GCash/Maya/bank QR now, so
        // the step is uploading those — set up on the storefront page.
        key: "payments",
        label: "Add your GCash / Maya / bank QR (optional)",
        href: "/admin/storefront",
        done: payQrReady,
      },
      {
        key: "printer",
        label: "Choose a printer method",
        href: "/admin/printing",
        done: printerConfigured,
      },
    ];

    return {
      steps,
      doneCount: steps.filter((s) => s.done).length,
      total: steps.length,
      completedAt: r.onboardingCompletedAt,
    };
  });
}
