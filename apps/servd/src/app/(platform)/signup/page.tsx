import { redirect } from "next/navigation";
import { SignupForm } from "./SignupForm";

/**
 * Public self-signup is invite-only: the platform owner creates accounts (they
 * sell a done-for-you setup). Direct visitors are sent to the login page.
 *
 * The gate is the `?ref=` parameter, which is what an invite link carries. It
 * was once a referral code that earned somebody a commission; the program pays
 * nothing now and nothing reads the value, but the links already handed out
 * still work, so the parameter stays as a plain invite marker.
 */
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const { ref } = await searchParams;
  if (!ref) redirect("/login");
  return <SignupForm />;
}
