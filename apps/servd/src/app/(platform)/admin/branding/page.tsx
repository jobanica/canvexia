import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { BrandingForm } from "@/components/admin/BrandingForm";

export default async function BrandingPage() {
  const { restaurantId } = await requireAdminPage();
  const r = await tenantDb(restaurantId, (tx) =>
    tx.restaurant.findFirstOrThrow({
      select: {
        displayName: true,
        tagline: true,
        brandPrimaryColor: true,
        brandAccentColor: true,
        logoUrl: true,
      },
    }),
  );

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-plum-ink/50">
          ← Dashboard
        </Link>
        <h1 className="font-heading text-2xl font-bold">Branding</h1>
        <p className="text-sm text-plum-ink/50">
          This is what diners see — your logo, name, and colors, not Servd&apos;s.
        </p>
      </div>
      <BrandingForm
        initial={{
          displayName: r.displayName ?? "",
          tagline: r.tagline ?? "",
          brandPrimaryColor: r.brandPrimaryColor ?? "",
          brandAccentColor: r.brandAccentColor ?? "",
          logoUrl: r.logoUrl,
        }}
      />
    </div>
  );
}
