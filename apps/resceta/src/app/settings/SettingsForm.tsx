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
  forReceipt,
  ...rest
}: {
  name: string;
  label: string;
  hint?: string;
  defaultValue?: string | null;
  /** Cannot be saved empty. Only for a field whose blank value would be wrong. */
  required?: boolean;
  /** Needed for a receipt to be official — but the form saves without it. */
  forReceipt?: boolean;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "defaultValue">) {
  return (
    <label className="block text-sm">
      <span className="mb-1 flex flex-wrap items-center gap-2 font-medium text-slate-700">
        {label}
        {required && <span className="text-red-600">*</span>}
        {/* Not a red star: this does not block saving. A pharmacy chasing its
            LTO still needs to record its address today, and a form that
            refuses is a form people work around. */}
        {forReceipt && (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-normal text-slate-600">
            needed on a receipt
          </span>
        )}
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
 * Nothing here blocks saving except the VAT rate, and that one is not a
 * preference: `z.coerce.number()` turns an empty box into 0, which would
 * silently record the pharmacy as NOT VAT-registered and drop the VAT box off
 * every future receipt. A blank that means something false has to be refused.
 *
 * The licence numbers are marked "needed on a receipt" instead. A pharmacy
 * still chasing its FDA LTO has to be able to record its address and trading
 * name today, and `receiptGaps` already tells the truth on the document itself
 * — the receipt prints NOT AN OFFICIAL RECEIPT until they are on file. Saying
 * it twice, once as a block, only teaches people to enter a placeholder.
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
          forReceipt
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
            Leave any of these blank and it saves — but the receipt then
            prints marked <strong>NOT AN OFFICIAL RECEIPT</strong>, because a
            blank space where a licence number belongs still looks official to
            a customer, and the pharmacy finds out at audit. Fill them in as
            the documents arrive.
          </p>
        </div>

        <Field
          name="tin"
          label="TIN"
          hint="Taxpayer Identification Number, as registered with BIR."
          defaultValue={settings.tin}
          maxLength={40}
          placeholder="000-000-000-00000"
          forReceipt
        />
        <Field
          name="fdaLtoNumber"
          label="FDA Licence to Operate"
          hint="The LTO number for this outlet."
          defaultValue={settings.fdaLtoNumber}
          maxLength={60}
          forReceipt
        />
        <Field
          name="prcLicenseNo"
          label="Supervising pharmacist PRC No."
          hint="The registered pharmacist under whose supervision this outlet dispenses."
          defaultValue={settings.prcLicenseNo}
          maxLength={60}
          forReceipt
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

      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
        <div>
          <h2 className="font-semibold">Receipts and the printer</h2>
          <p className="mt-1 text-sm text-slate-600">
            A receipt laid out for an 80mm roll and printed on a 58mm one wraps
            every line, so the width is set here rather than guessed. The BIR
            permit number and machine serial are what a registered POS has to
            print on every receipt.
          </p>
        </div>
        <label className="block text-sm">
          <span className="font-medium">Paper width</span>
          <select
            name="receiptPaperMm"
            defaultValue={String(settings.receiptPaperMm ?? 58)}
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="58">58mm (most thermal printers)</option>
            <option value="80">80mm (wide roll)</option>
          </select>
        </label>
        <Field
          name="receiptHeader"
          label="Line above the receipt"
          defaultValue={settings.receiptHeader}
          maxLength={400}
          hint="Printed under the shop name. A branch line, or a tagline."
        />
        <Field
          name="receiptFooter"
          label="Line below the receipt"
          defaultValue={settings.receiptFooter}
          maxLength={400}
          hint="Returns policy, opening hours, thank-you."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            name="birPermitNo"
            label="BIR permit number"
            defaultValue={settings.birPermitNo}
            maxLength={60}
          />
          <Field
            name="posSerialNo"
            label="Machine serial number"
            defaultValue={settings.posSerialNo}
            maxLength={60}
          />
        </div>
      </section>

      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
        <div>
          <h2 className="font-semibold">Loyalty points</h2>
          {/*
            BOTH OR NEITHER. Points that can be earned and never spent are worse
            than no points at all — so the programme is only on when an earn
            rate AND a redemption value are set, and zero in either means off.
          */}
          <p className="mt-1 text-sm text-slate-600">
            Off unless both numbers are set. Points that can be earned and never
            spent are worse than none — so a redemption value of zero switches
            the whole thing off, whatever the earn rate says.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            name="loyaltyPointsPerPeso"
            label="Points earned per peso spent"
            type="number"
            min={0}
            step={1}
            defaultValue={String(settings.loyaltyPointsPerPeso ?? 0)}
            hint="1 means a ₱250 purchase earns 250 points. 0 switches earning off."
          />
          <Field
            name="loyaltyCentavosPerPoint"
            label="What one point is worth, in centavos"
            type="number"
            min={0}
            step={1}
            defaultValue={String(settings.loyaltyCentavosPerPoint ?? 0)}
            hint="5 means 100 points is worth ₱5.00. 0 switches redeeming off."
          />
        </div>
      </section>

      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
        <div>
          <h2 className="font-semibold">Public shop page</h2>
          <p className="mt-1 text-sm text-slate-600">
            A page customers can open to see what you stock and send an order
            request. It is <strong>off</strong> until you turn it on — a public
            page listing medicine is a decision, not something to discover you
            have made.
          </p>
          {/*
            PRESCRIPTION-ONLY ITEMS ARE NEVER LISTED, whatever this is set to.
            Dispensing one without a prescription is an offence, and a public
            page that takes an order for one is an invitation to commit it.
          */}
          <p className="mt-1 text-sm text-slate-600">
            Prescription-only items are never shown or orderable on it, whatever
            else is set. Nothing on the page moves stock — an order is a request
            you confirm and ring up at the counter.
          </p>
        </div>
        {/*
          The marker. Its presence tells the server this section was on screen,
          so an absent checkbox means "off" rather than "not sent".
        */}
        <input type="hidden" name="storefrontSection" value="1" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="storefrontOn" defaultChecked={settings.storefrontOn} />
          Publish the shop page
        </label>
        <Field
          name="storefrontBlurb"
          label="What to say at the top"
          defaultValue={settings.storefrontBlurb}
          maxLength={600}
          hint="Opening hours, where you are, how fast you reply."
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="storefrontAcceptsDelivery"
            defaultChecked={settings.storefrontAcceptsDelivery}
          />
          Offer delivery as well as pick-up
        </label>
        {settings.storefrontOn && (
          <p className="text-sm text-slate-600">
            Your page is at{" "}
            <a href={`/shop/${settings.slug}`} className="font-medium underline" target="_blank" rel="noreferrer">
              /shop/{settings.slug}
            </a>
            .
          </p>
        )}
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
