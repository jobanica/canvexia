import { cookies } from "next/headers";
import Link from "next/link";
import { REF_COOKIE, normalizeReferralCode } from "@servd/core/agent-kit/ref";
import { SignupForm } from "./SignupForm";

export const dynamic = "force-dynamic";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams;
  const cookieRef = (await cookies()).get(REF_COOKIE)?.value;
  const initialCode = normalizeReferralCode(ref) ?? normalizeReferralCode(cookieRef) ?? "";
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Start with Resceta</h1>
        <p className="mt-1 text-sm text-slate-600">Pharmacy POS, batch inventory and expiry tracking.</p>
      </header>
      <SignupForm initialCode={initialCode} />
      <p className="mt-6 text-sm text-slate-600">
        Already have an account? <Link href="/login" className="font-medium underline">Sign in</Link>.
      </p>
    </main>
  );
}
