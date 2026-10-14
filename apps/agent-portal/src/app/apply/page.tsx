import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthUser, getSignedIn } from "@/server/auth";
import { activeAgentAgreement } from "@/server/agents";
import { ActionForm } from "@/components/ActionForm";
import { PAYOUT_METHODS } from "@/lib/application";
import { applyAction } from "./actions";

export const dynamic = "force-dynamic";

// Underline inputs on a transparent field, like the reference design. Scoped to
// this page: the shared inputClass (admin forms) is left alone. The label lives
// in the placeholder for the look, and in aria-label for a screen reader.
const field =
  "w-full border-0 border-b border-slate-300 bg-transparent px-0 py-2 text-base text-slate-800 placeholder:text-slate-400 focus:border-[#7c5cf5] focus:outline-none focus:ring-0 sm:text-sm";
const sectionLabel = "mt-7 text-xs font-semibold uppercase tracking-[0.15em] text-slate-400";

const pillButton =
  "mt-8 w-full rounded-full bg-gradient-to-r from-[#7c5cf5] to-[#5b3fd6] px-8 py-3.5 text-sm font-semibold uppercase tracking-wide text-white shadow-lg shadow-violet-500/30 transition-shadow hover:shadow-xl disabled:opacity-40";

export default async function ApplyPage() {
  const [who, user, agreement] = await Promise.all([
    getSignedIn().catch(() => null),
    getAuthUser().catch(() => null),
    activeAgentAgreement(),
  ]);
  if (who) redirect("/");

  return (
    <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,#8b5cf6_0%,#6d5cf5_45%,#4f7bf0_100%)] px-4 py-10">
      <div className="w-full max-w-xl rounded-3xl bg-white p-7 shadow-2xl shadow-indigo-900/30 sm:p-10">
        <h1 className="text-center text-2xl font-bold uppercase tracking-[0.15em] text-slate-800">
          Create account
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-center text-sm text-slate-500">
          Refer businesses to CANVEXIA products and earn a commission on every payment they make. You
          never handle a customer&apos;s money — they pay CANVEXIA directly.
        </p>

        {!agreement ? (
          <p className="mt-8 rounded-xl border border-amber-300 bg-amber-50 p-4 text-center text-sm text-amber-900">
            Applications are closed right now. Please check back later.
          </p>
        ) : (
          <ActionForm
            action={applyAction}
            submitLabel="Sign up"
            pendingLabel="Submitting…"
            submitClassName={pillButton}
            className="mt-6"
          >
            {!user && (
              <>
                <p className={`${sectionLabel} first:mt-2`}>Your login</p>
                <div className="mt-2 space-y-5">
                  <input name="email" type="email" required autoComplete="email" placeholder="Email" aria-label="Email" className={field} />
                  <div className="grid gap-5 sm:grid-cols-2">
                    <input name="password" type="password" required minLength={8} autoComplete="new-password" placeholder="Password" aria-label="Password" className={field} />
                    <input name="confirmPassword" type="password" required minLength={8} autoComplete="new-password" placeholder="Re-type password" aria-label="Re-type password" className={field} />
                  </div>
                  <p className="text-xs text-slate-400">Password must be at least 8 characters.</p>
                </div>
              </>
            )}

            <p className={sectionLabel}>About you</p>
            <div className="mt-2 space-y-5">
              <input name="name" required autoComplete="name" placeholder="Full name" aria-label="Full name" className={field} />
              <input name="mobile" type="tel" required autoComplete="tel" placeholder="Mobile number (0917 123 4567)" aria-label="Mobile number" className={field} />
            </div>

            <p className={sectionLabel}>How you get paid</p>
            <div className="mt-2 space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <select name="payoutMethod" required defaultValue="GCash" aria-label="Payout method" className={field}>
                  {PAYOUT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m === "Bank" ? "Bank transfer" : m}
                    </option>
                  ))}
                </select>
                <input name="payoutAccountNumber" required inputMode="numeric" placeholder="Account or mobile number" aria-label="Account or mobile number" className={field} />
              </div>
              <input name="payoutAccountName" required placeholder="Account name" aria-label="Account name" className={field} />
              <input name="bankName" placeholder="Bank name (only for bank transfer)" aria-label="Bank name" className={field} />
            </div>

            <p className={sectionLabel}>Agent agreement (version {agreement.version})</p>
            <div className="mt-2 max-h-52 overflow-y-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-xs leading-relaxed text-slate-600">
              {agreement.body}
            </div>
            <input type="hidden" name="agreementVersion" value={agreement.version} />
            <label className="mt-3 flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" name="accept" required className="mt-1 h-4 w-4 accent-[#5b3fd6]" />
              <span>I have read and accept the agent agreement.</span>
            </label>
          </ActionForm>
        )}

        <p className="mt-8 text-center text-sm text-slate-500">
          Already applied?{" "}
          <Link href="/login" className="font-semibold text-[#5b3fd6] underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
