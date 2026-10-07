import "server-only";
import { redirect } from "next/navigation";
import { getSignedIn, type SignedInStaff } from "@/server/auth";

/** For pages a verifier may use too (the verification queue). */
export async function requireStaffPage(): Promise<SignedInStaff> {
  const who = await getSignedIn();
  if (!who) redirect("/login?next=/admin/queue");
  if (who.kind !== "staff") redirect("/");
  return who;
}

/** "3h", "2d 4h" — how long a receipt has waited. */
export function ageLabel(since: Date, now = new Date()): string {
  const mins = Math.max(0, Math.floor((now.getTime() - since.getTime()) / 60_000));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}
