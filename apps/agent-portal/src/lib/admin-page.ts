import "server-only";
import { redirect } from "next/navigation";
import { getSignedIn, type SignedInStaff } from "@/server/auth";

/** For admin-only pages: a verifier who types the URL lands on the overview. */
export async function requireAdminPage(): Promise<SignedInStaff> {
  const who = await getSignedIn();
  if (!who) redirect("/login?next=/admin");
  if (who.kind !== "staff") redirect("/");
  if (who.role !== "admin") redirect("/admin");
  return who;
}
