import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/server/tenancy/current-user";
import { AppShell } from "@/components/AppShell";
import { pharmacySettings } from "@/server/pharmacy/settings";
import { can } from "@/lib/pharmacy/roles";
import { SettingsForm } from "./SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login?next=%2Fsettings");

  // Checked here as well as filtered out of the nav. The nav is a convenience;
  // this is the check.
  if (!can(staff.role, "manageSettings")) {
    return (
      <AppShell staff={staff}>
        <main className="mx-auto max-w-lg px-6 py-16 text-center">
          <p className="rounded-lg border border-white/10 bg-white/[0.04] backdrop-blur-xl p-6 text-sm text-slate-300">
            Only the owner can change the pharmacy&apos;s details.
          </p>
        </main>
      </AppShell>
    );
  }

  const settings = await pharmacySettings(staff.pharmacyId);
  if (!settings) redirect("/");

  return (
    <AppShell staff={staff}>
      <main className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="mb-2 text-2xl font-semibold tracking-tight">Pharmacy details</h1>
        <p className="mb-8 text-sm text-slate-500">
          What appears on your receipts.
        </p>
        <SettingsForm settings={settings} />
      </main>
    </AppShell>
  );
}
