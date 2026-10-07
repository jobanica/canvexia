import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { systemDb, type StaffRole } from "@/server/scoped-db";
import type { Actor } from "@/server/audit";
import type { AgentStatus } from "@/lib/agent-status";

/**
 * Who is signed in to the portal.
 *
 * Identity is the Supabase session plus a row in `agents` or `portal_staff`,
 * never anything from the URL or the form. A login can be both an agent and
 * staff (the owner testing their own link); staff wins, because the staff
 * screens are a superset of what they need.
 *
 * Resolved under systemDb because it is the lookup that DECIDES the scope —
 * there is no scope to be in until it returns.
 */

export interface SignedInAgent {
  kind: "agent";
  authUserId: string;
  email: string;
  agentId: string;
  name: string;
  status: AgentStatus;
  referralCode: string;
}

export interface SignedInStaff {
  kind: "staff";
  authUserId: string;
  email: string;
  staffId: string;
  role: StaffRole;
}

export type SignedIn = SignedInAgent | SignedInStaff;

export async function getAuthUser(): Promise<{ id: string; email: string } | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { id: user.id, email: user.email ?? "" } : null;
}

export async function getSignedIn(): Promise<SignedIn | null> {
  const user = await getAuthUser();
  if (!user) return null;

  return systemDb(async (tx) => {
    const staff = await tx.portalStaff.findUnique({
      where: { authUserId: user.id },
      select: { id: true, role: true, active: true, email: true },
    });
    if (staff?.active) {
      return {
        kind: "staff",
        authUserId: user.id,
        email: staff.email,
        staffId: staff.id,
        role: staff.role,
      } satisfies SignedInStaff;
    }
    const agent = await tx.agent.findUnique({
      where: { authUserId: user.id },
      select: { id: true, name: true, status: true, referralCode: true, email: true },
    });
    if (!agent) return null;
    return {
      kind: "agent",
      authUserId: user.id,
      email: agent.email,
      agentId: agent.id,
      name: agent.name,
      status: agent.status,
      referralCode: agent.referralCode,
    } satisfies SignedInAgent;
  });
}

/**
 * Any agent who may sign in. A removed agent may not; a pending or suspended
 * one may, to see why they cannot do anything yet.
 */
export async function requireAgent(): Promise<SignedInAgent> {
  const who = await getSignedIn();
  if (!who || who.kind !== "agent") throw new Error("UNAUTHENTICATED");
  if (who.status === "removed") throw new Error("FORBIDDEN");
  return who;
}

export async function requireStaff(role?: StaffRole): Promise<SignedInStaff> {
  const who = await getSignedIn();
  if (!who || who.kind !== "staff") throw new Error("UNAUTHENTICATED");
  if (role === "admin" && who.role !== "admin") throw new Error("FORBIDDEN");
  return who;
}

export function staffActor(s: SignedInStaff): Actor {
  return { type: s.role, id: s.staffId, email: s.email };
}

export function agentActor(a: SignedInAgent): Actor {
  return { type: "agent", id: a.agentId, email: a.email };
}
