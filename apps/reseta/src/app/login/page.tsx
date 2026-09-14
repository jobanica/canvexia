import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/server/tenancy/current-user";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

/**
 * `next` is where to go after signing in. It is checked to be a path on this
 * site before it is used: an open redirect on a login page is how a phishing
 * link borrows your domain's credibility.
 */
function safeNext(raw: string | undefined): string {
  if (!raw) return "/";
  // Must start with a single slash. "//evil.test" and "https://evil.test" are
  // both absolute, and the first one looks relative at a glance.
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const target = safeNext(next);

  // Already signed in — no reason to show the form.
  const staff = await getCurrentStaff().catch(() => null);
  if (staff) redirect(target);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Reseta</h1>
        <p className="mt-1 text-sm text-slate-600">
          Sign in to your pharmacy.
        </p>
      </header>

      <LoginForm next={target} />

      <p className="mt-8 text-xs text-slate-500">
        Accounts are created by your pharmacy&apos;s owner or manager, not here.
      </p>
    </main>
  );
}
