import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/tenancy/current-user";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { AccountForms } from "@/components/admin/AccountForms";

export default async function AccountPage() {
  const { restaurantId } = await requireAdminPage();
  const user = await getCurrentUser();
  if (!user || user.kind !== "staff") redirect("/login");

  let phone = "";
  let address = "";
  try {
    const r = await tenantDb(restaurantId, (tx) =>
      tx.restaurant.findFirstOrThrow({ select: { printerConfig: true } }),
    );
    const receipt = (r.printerConfig as { receipt?: { phone?: string; address?: string } } | null)?.receipt;
    phone = receipt?.phone ?? "";
    address = receipt?.address ?? "";
  } catch {
    /* ignore */
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-plum-ink/50">← Dashboard</Link>
        <h1 className="font-heading text-2xl font-bold">Account</h1>
        <p className="text-sm text-plum-ink/50">Change your login email, password, contact phone, and business address.</p>
      </div>
      <AccountForms initial={{ email: user.email, phone, address }} />
    </div>
  );
}
