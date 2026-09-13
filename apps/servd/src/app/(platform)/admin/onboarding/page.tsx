import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { getOnboardingState } from "@/server/onboarding/progress";
import { finishOnboarding } from "@/server/onboarding/actions";

export default async function OnboardingPage() {
  const { restaurantId } = await requireAdminPage();
  const state = await getOnboardingState(restaurantId);
  const pct = Math.round((state.doneCount / state.total) * 100);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Welcome to Servd 👋</h1>
        <p className="text-sm text-plum-ink/60">
          Let&apos;s get your restaurant ready. Do these in any order — you can
          skip and come back.
        </p>
      </div>

      {/* Progress */}
      <div>
        <div className="mb-1 flex justify-between text-xs text-plum-ink/50">
          <span>{state.doneCount} of {state.total} done</span>
          <span>{pct}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-plum-ink/10">
          <div className="h-full bg-brand-gradient" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <ol className="space-y-2">
        {state.steps.map((step) => (
          <li key={step.key}>
            <Link
              href={step.href}
              className="flex items-center gap-3 rounded-tile border border-plum-ink/10 bg-white p-4 transition hover:border-brand-primary"
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                  step.done
                    ? "bg-brand-gradient text-white"
                    : "border border-plum-ink/20 text-plum-ink/40"
                }`}
              >
                {step.done ? "✓" : ""}
              </span>
              <span className={`flex-1 font-medium ${step.done ? "text-plum-ink/50 line-through" : ""}`}>
                {step.label}
              </span>
              <span className="text-plum-ink/30">→</span>
            </Link>
          </li>
        ))}
      </ol>

      <div className="flex items-center justify-between">
        {/* Both exit the wizard by marking it dismissed — otherwise /admin
            redirects straight back here (onboardingCompletedAt is still null). */}
        <form action={finishOnboarding}>
          <button className="text-sm text-plum-ink/50 hover:text-plum-ink/70">
            Skip for now
          </button>
        </form>
        <form action={finishOnboarding}>
          <button className="rounded-full px-5 py-2 text-sm font-semibold btn-brand">
            {state.doneCount === state.total ? "Finish setup" : "Finish later"}
          </button>
        </form>
      </div>
    </div>
  );
}
