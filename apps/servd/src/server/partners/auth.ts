import "server-only";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { systemDb } from "@/server/tenancy/scoped-db";

export interface CurrentPartner {
  id: string;
  name: string;
  email: string;
  status: string;
  tier: string;
}

/** Resolve the logged-in Supabase user to a partner row, if any. */
export async function getCurrentPartner(): Promise<CurrentPartner | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  try {
    const partner = await systemDb((tx) =>
      tx.partner.findUnique({
        where: { authUserId: user.id },
        select: { id: true, name: true, email: true, status: true, tier: true },
      }),
    );
    return partner ?? null;
  } catch {
    return null;
  }
}

/** Gate a partner-portal page. Redirects to apply/login when not a partner. */
export async function requirePartnerPage(): Promise<CurrentPartner> {
  const partner = await getCurrentPartner();
  if (!partner) redirect("/partner/login");
  return partner;
}
