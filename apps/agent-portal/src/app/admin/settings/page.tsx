import { requireAdminPage } from "@/lib/admin-page";
import { staffDb } from "@/server/scoped-db";
import { loadSettingsWithIssues } from "@/server/settings";
import { ActionForm, Field, inputClass } from "@/components/ActionForm";
import { saveSettingsAction } from "./actions";

export default async function SettingsPage() {
  await requireAdminPage();
  const { settings: s, invalid } = await staffDb("admin", loadSettingsWithIssues);
  const num = (name: string, value: number | null, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <input name={name} type="number" defaultValue={value ?? ""} className={inputClass} {...props} />
  );

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold">Settings</h1>
      <p className="mt-1 text-sm text-slate-600">
        Program rules that are not final. Changes apply from now on and are recorded in the audit log.
      </p>
      {invalid.length > 0 && (
        <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
          These stored values could not be read and are running on their defaults: {invalid.join(", ")}.
          Saving this form fixes them.
        </p>
      )}
      <ActionForm action={saveSettingsAction} submitLabel="Save settings" className="mt-4 space-y-4 rounded-lg border border-slate-200 bg-white p-4">
        <Field label="Activation commission is payable from paid month" hint="1 = as soon as the activation is confirmed.">
          {num("activation_commission_release_month", s.activation_commission_release_month, { min: 1, max: 24, required: true })}
        </Field>
        <Field label="Cap on tier-2 months" hint="Blank = no cap.">
          {num("residual_max_months", s.residual_max_months, { min: 1 })}
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="residual_requires_active_agent" defaultChecked={s.residual_requires_active_agent} />
          Pay tier-2 only to agents who referred someone recently
        </label>
        <Field label="“Recently” means within (days)">
          {num("active_agent_window_days", s.active_agent_window_days, { min: 1, required: true })}
        </Field>
        <Field label="Payout day of month" hint="1–28.">
          {num("payout_day_of_month", s.payout_day_of_month, { min: 1, max: 28, required: true })}
        </Field>
        <Field label="Minimum payout (₱)" hint="Smaller balances carry forward to the next month.">
          <input name="payout_minimum_amount" inputMode="decimal" required defaultValue={(s.payout_minimum_amount / 100).toFixed(2)} className={inputClass} />
        </Field>
        <Field label="Days after signup an admin may add a missing referral code">
          {num("late_referral_code_days", s.late_referral_code_days, { min: 0, required: true })}
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="allow_self_referral" defaultChecked={s.allow_self_referral} />
          Allow self-referral (an agent&apos;s own mobile number as the business owner&apos;s)
        </label>
        <Field label="Contract minimum term (months)">
          {num("contract_minimum_months", s.contract_minimum_months, { min: 1, required: true })}
        </Field>
      </ActionForm>
    </div>
  );
}
