import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { REF_COOKIE, normalizeReferralCode } from "@servd/core/agent-kit/ref";
import { SignupForm } from "./SignupForm";

/**
 * Public self-signup is invite-only: the platform owner creates accounts (they
 * sell a done-for-you setup). Direct visitors are sent to the login page.
 *
 * The gate is the `?ref=` parameter, which is what an invite link carries —
 * or the referral cookie it leaves behind (D37), so a visitor who arrived on
 * an agent's link and came back to sign up later still gets in.
 *
 * `?ref=` is an agent's referral code again (D37). Links handed out before
 * that carry other values; those still open the form, and simply prefill no
 * code, because normalizeReferralCode reads anything that is not a code as
 * none and the portal ignores a code it does not know.
 */
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const { ref } = await searchParams;
  const cookieRef = (await cookies()).get(REF_COOKIE)?.value;
  if (!ref && !cookieRef) redirect("/login");
  const initialCode = normalizeReferralCode(ref) ?? normalizeReferralCode(cookieRef) ?? "";
  return <SignupForm initialCode={initialCode} />;
}
