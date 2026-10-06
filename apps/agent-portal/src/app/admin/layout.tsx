import { redirect } from "next/navigation";
import { getSignedIn } from "@/server/auth";
import { AdminShell } from "@/components/AdminShell";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const who = await getSignedIn();
  if (!who) redirect("/login?next=/admin");
  if (who.kind !== "staff") redirect("/");
  return <AdminShell staff={who}>{children}</AdminShell>;
}
