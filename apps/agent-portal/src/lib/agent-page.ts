import "server-only";
import { redirect } from "next/navigation";
import { getSignedIn, type SignedInAgent } from "@/server/auth";

/** For agent pages: staff go to /admin, removed agents and strangers to /login. */
export async function requireAgentPage(next: string): Promise<SignedInAgent> {
  const who = await getSignedIn();
  if (!who) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (who.kind === "staff") redirect("/admin");
  if (who.status === "removed") redirect("/login");
  return who;
}
