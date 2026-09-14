"use client";

import { useActionState } from "react";
import { saveSettings, type SettingsState } from "./actions";
import type { PharmacySettings } from "@/server/pharmacy/settings";

const IDLE: SettingsState = { status: "idle" };

function Field({
  name,
  label,
  hint,
  defaultValue,
  required,
  ...rest
}: {
  name: string;
  label: string;
  hint?: string;
  defaultValue?: string | null;
  required?: boolean;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "defaultValue">) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">
        {label}
        {required && <span className="ml-1 text-red-600">*</span>}
      </span>
      <input
        name={name}
        defaultValue={defaultValue ?? ""}
        className="w-full rounded border border-slate-300 px-2 py-1.5"
        {...rest}
      />
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

/**
 * The pharmacy's own details.
 *
 * The starred fields are starred because a receipt without them is not an
 * official receipt — that is what the star means here, not "we would like
 * this". The print page says the same thing in the same words, so the two
 * screens do not disagree about what is required.
 */
export function SettingsForm({ settings }: { settings: PharmacySettings }) {
  const [state, action, pending] = useActionState(saveSettings, IDLE);

  return (
    <form action={action} className="space-y-8">
      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
        <div>
          <h2 className="font-semibold">On the receipt</h2>
          <p className="mt-1 text-sm text-slate-600">
            Registered as <strong>{settings.name}</strong>. These appear at the
            head of every receipt printed from now on; receipts already printed
            are unchanged.
          </p>
        </div>

        <Field
          name="displayName"
          label="Trading name"
          hint="Shown instead of the registered name, if you trade under a different one."
          defaultValue={settings.displayName}
          maxLength={120}
        />
        <Field
          name="address"
          label="Business address"
          hint="The registered address. BIR requires it on the face of an invoice."
          defaultValue={settings.address}
          maxLength={300}
          required
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="phone" label="Phone" defaultValue={settings.phone} maxLength={40} />
          <Field
            name="email"
            label="Email"
            type="email"
            defaultValue={settings.email}
            maxLength={200}
          />
        </div>
      </section>

      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
        <div>
          <h2 className="font-semibold">Licences and registration</h2>
          <p className="mt-1 text-sm text-slate-600">
            A receipt missing any of these prints marked{" "}
            <strong>NOT AN OFFICIAL RECEIPT</strong> — a blank space where a
            licence number belongs still looks official to a customer, and the
            pharmacy finds out at audit.
          </p>
        </div>

        <Field
          name="tin"
          label="TIN"
          hint="Taxpayer Identification Number, as registered with BIR."
          defaultValue={settings.tin}
          maxLength={40}
          placeholder="000-000-000-00000"
          required
        />
        <Field
          name="fdaLtoNumber"
          label="FDA Licence to Operate"
          hint="The LTO number for this outlet."
          defaultValue={settings.fdaLtoNumber}
          maxLength={60}
          required
        />
        <Field
          name="prcLicenseNo"
          label="Supervising pharmacist PRC No."
          hint="The registered pharmacist under whose supervision this outlet dispenses."
          defaultValue={settings.prcLicenseNo}
          maxLength={60}
          required
        />
      </section>

      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
        <div>
          <h2 className="font-semibold">VAT</h2>
          <p className="mt-1 text-sm text-slate-600">
            This drives the VAT box on every receipt <em>and</em> the Senior
            Citizen and PWD arithmetic — the 20% is taken on the VAT-exclusive
            price, so the rate is part of a statutory calculation. Change it only
            when your registration actually changes.
          </p>
        </div>
        <Field
          name="vatRatePct"
          label="VAT rate (%)"
          type="number"
          min={0}
          max={25}
          step={1}
          hint="12 in the Philippines. Set 0 if this pharmacy is not VAT-registered — receipts then print the non-VAT wording instead of a VAT box."
          defaultValue={String(settings.vatRatePct)}
          required
        />
      </section>

      {state.status === "error" && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          {state.message}
        </p>
      )}
      {state.status === "done" && (
        <p className="rounded border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
