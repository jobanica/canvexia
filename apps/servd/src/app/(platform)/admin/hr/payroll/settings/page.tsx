import Link from "next/link";
import { requireHrPage } from "@/server/hr/guard";
import { getPayrollConfig } from "@/server/hr/payroll-config";
import { PayrollSettingsForm } from "@/components/admin/hr/PayrollSettingsForm";

export default async function PayrollSettingsPage() {
  const { restaurantId, eligible } = await requireHrPage();
  if (!eligible) return <p className="text-sm text-plum-ink/60">HRIS not enabled.</p>;
  const cfg = await getPayrollConfig(restaurantId);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/hr/payroll" className="text-sm text-plum-ink/50">← Payroll</Link>
        <h1 className="font-heading text-2xl font-bold">Payroll deductions</h1>
        <p className="text-sm text-plum-ink/50">Statutory contributions applied to each payslip.</p>
      </div>
      <PayrollSettingsForm
        initial={{
          sss: cfg.sssAmount / 100,
          philhealth: cfg.philhealthAmount / 100,
          pagibig: cfg.pagibigAmount / 100,
          bir: cfg.birAmount / 100,
          thirteenthMonth: cfg.thirteenthMonth,
        }}
      />
    </div>
  );
}
