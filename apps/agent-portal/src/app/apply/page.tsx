import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthUser, getSignedIn } from "@/server/auth";
import { activeAgentAgreement } from "@/server/agents";
import { ActionForm, Field, inputClass } from "@/components/ActionForm";
import { PAYOUT_METHODS } from "@/lib/application";
import { applyAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ApplyPage() {
  const [who, user, agreement] = await Promise.all([
    getSignedIn().catch(() => null),
    getAuthUser().catch(() => null),
    activeAgentAgreement(),
  ]);
  if (who) redirect("/");

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Become a CANVEXIA agent</h1>
      <p className="mt-2 text-sm text-slate-600">
        Refer businesses to CANVEXIA products and earn a commission on every payment they make.
        You never handle a customer&apos;s money — they pay CANVEXIA directly.
      </p>

      {!agreement ? (
        <p className="mt-6 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Applications are closed right now. Please check back later.
        </p>
      ) : (
        <ActionForm action={applyAction} submitLabel="Submit application" pendingLabel="Submitting…" className="mt-6 space-y-4">
          {!user && (
            <fieldset className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
              <legend className="px-1 text-sm font-semibold">Your login</legend>
              <Field label="Email">
                <input name="email" type="email" required autoComplete="email" className={inputClass} />
              </Field>
              <Field label="Password" hint="At least 8 characters.">
                <input name="password" type="password" required minLength={8} autoComplete="new-password" className={inputClass} />
              </Field>
            </fieldset>
          )}

          <fieldset className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
            <legend className="px-1 text-sm font-semibold">About you</legend>
            <Field label="Full name">
              <input name="name" required autoComplete="name" className={inputClass} />
            </Field>
            <Field label="Mobile number">
              <input name="mobile" type="tel" required autoComplete="tel" placeholder="0917 123 4567" className={inputClass} />
            </Field>
          </fieldset>

          <fieldset className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
            <legend className="px-1 text-sm font-semibold">How you get paid</legend>
            <Field label="Payout method">
              <select name="payoutMethod" required defaultValue="GCash" className={inputClass}>
                {PAYOUT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m === "Bank" ? "Bank transfer" : m}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Bank name" hint="Only for bank transfer.">
              <input name="bankName" className={inputClass} />
            </Field>
            <Field label="Account name">
              <input name="payoutAccountName" required className={inputClass} />
            </Field>
            <Field label="Account or mobile number">
              <input name="payoutAccountNumber" required inputMode="numeric" className={inputClass} />
            </Field>
          </fieldset>

          <fieldset className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
            <legend className="px-1 text-sm font-semibold">Agent agreement (version {agreement.version})</legend>
            <div className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">
              {agreement.body}
            </div>
            <input type="hidden" name="agreementVersion" value={agreement.version} />
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="accept" required className="mt-1 h-4 w-4" />
              <span>I have read and accept the agent agreement.</span>
            </label>
          </fieldset>
        </ActionForm>
      )}

      <p className="mt-8 text-sm text-slate-600">
        Already applied?{" "}
        <Link href="/login" className="font-medium text-slate-900 underline">
          Sign in
        </Link>
        .
      </p>
    </main>
  );
}
