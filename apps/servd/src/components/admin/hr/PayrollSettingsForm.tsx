"use client";

import { useActionState } from "react";
import { updatePayrollConfig, type PayrollCfgState } from "@/server/hr/payroll-config-actions";
import { SubmitButton } from "@/components/admin/SubmitButton";

export function PayrollSettingsForm({
  initial,
}: {
  initial: {
    sss: number;
    philhealth: number;
    pagibig: number;
    bir: number;
    thirteenthMonth: boolean;
  };
}) {
  const [state, action] = useActionState<PayrollCfgState, FormData>(updatePayrollConfig, null);

  const field = (name: "sss" | "philhealth" | "pagibig" | "bir", label: string) => (
    <div>
      <label className="block text-sm font-semibold">{label}</label>
      <div className="mt-1 flex items-center gap-2">
        <span className="text-sm text-plum-ink/50">₱</span>
        <input
          name={name}
          type="number"
          step="0.01"
          min={0}
          defaultValue={initial[name].toFixed(2)}
          className="w-32 rounded-lg border border-plum-ink/15 px-3 py-2"
        />
        <span className="text-sm text-plum-ink/50">per pay period</span>
      </div>
    </div>
  );

  return (
    <form action={action} className="max-w-xl space-y-5 rounded-tile border border-plum-ink/10 bg-white p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        {field("sss", "SSS")}
        {field("philhealth", "PhilHealth")}
        {field("pagibig", "Pag-IBIG")}
        {field("bir", "BIR withholding")}
      </div>

      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" name="thirteenthMonth" defaultChecked={initial.thirteenthMonth} />
        Accrue 13th-month pay (1/12 of base, shown as an accrual)
      </label>

      <p className="rounded-lg bg-cream px-3 py-2 text-xs text-plum-ink/60">
        Fixed peso amounts deducted from each payslip (employee share). Set them to match each
        employee&apos;s SSS/PhilHealth/Pag-IBIG/BIR bracket.
      </p>

      {state?.error && <p className="text-sm text-guava">{state.error}</p>}
      {state?.ok && <p className="text-sm text-mango">Saved.</p>}
      <SubmitButton>Save deduction settings</SubmitButton>
    </form>
  );
}
