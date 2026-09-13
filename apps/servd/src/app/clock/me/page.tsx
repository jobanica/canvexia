import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/tenancy/current-user";
import { getMyClockStatus } from "@/server/hr/clock-self";
import { SelfieClock } from "@/components/hr/SelfieClock";

/** Self clock-in/out with a selfie, for any signed-in staff member. */
export default async function MyClockPage() {
  const user = await getCurrentUser();
  if (!user || user.kind !== "staff") redirect("/login");

  const status = await getMyClockStatus();
  const home =
    user.role === "kitchen" ? "/kitchen" : user.role === "cashier" ? "/cashier" : "/admin";

  return (
    <main className="min-h-screen bg-cream px-4 py-10">
      <div className="mx-auto max-w-sm">
        <Link href={home} className="text-sm text-plum-ink/50">← Back</Link>
        <h1 className="mb-4 mt-1 font-heading text-2xl font-bold">Time clock</h1>
        <SelfieClock initial={status} />
        <p className="mx-auto mt-4 max-w-sm text-center text-xs text-plum-ink/40">
          Your photo and time are recorded for your timesheet.
        </p>
      </div>
    </main>
  );
}
