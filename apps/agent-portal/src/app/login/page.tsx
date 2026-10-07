import Link from "next/link";
import { redirect } from "next/navigation";
import { getSignedIn } from "@/server/auth";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

/** Only a path on this site: an open redirect on a login page lends a phishing link our domain. */
function safeNext(raw: string | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const target = safeNext(next);
  if (await getSignedIn().catch(() => null)) redirect(target);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">CANVEXIA Agents</h1>
        <p className="mt-1 text-sm text-slate-600">Sign in to your agent account.</p>
      </header>
      <LoginForm next={target} />
      <p className="mt-8 text-sm text-slate-600">
        Not an agent yet?{" "}
        <Link href="/apply" className="font-medium text-slate-900 underline">
          Apply here
        </Link>
        .
      </p>
    </main>
  );
}
