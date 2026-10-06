import type { Prisma } from "@prisma/client";
import type { Tx } from "@/server/scoped-db";

/**
 * One row in agent_audit_log, written in the caller's transaction so a change
 * and its record land together or not at all.
 *
 * The table is append-only (trigger in rls.sql), and the insert policy makes an
 * agent or verifier write as themselves — `actorType` must match the scope the
 * transaction runs under, or Postgres refuses the row.
 */
export interface Actor {
  type: "admin" | "verifier" | "agent" | "system" | "product";
  id: string | null;
  email: string | null;
}

export const SYSTEM_ACTOR: Actor = { type: "system", id: null, email: null };

export async function writeAudit(
  tx: Tx,
  actor: Actor,
  entry: {
    action: string;
    entity: string;
    entityId?: string | null;
    before?: unknown;
    after?: unknown;
  },
): Promise<void> {
  // createMany, not create: create is INSERT … RETURNING, and RETURNING needs
  // a SELECT policy. Only admins may read the audit log, so an agent's or a
  // verifier's own row would be refused on the way back out.
  await tx.agentAuditLog.createMany({
    data: {
      actorType: actor.type,
      actorId: actor.id,
      actorEmail: actor.email,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      before: (entry.before ?? undefined) as Prisma.InputJsonValue | undefined,
      after: (entry.after ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}
