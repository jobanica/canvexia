/**
 * What an admin may do to an agent, and what it leads to.
 *
 * `removed` is terminal. A removed agent keeps their customers and their
 * ledger — commission already earned is still owed — but cannot sign in to
 * act and their code stops attaching new customers. Bringing someone back is a
 * new application, so the history of the first one stays readable.
 */
export type AgentStatus = "pending" | "active" | "suspended" | "removed";
export type AgentAction = "approve" | "reject" | "suspend" | "reinstate" | "remove";

const TRANSITIONS: Record<AgentAction, { from: AgentStatus[]; to: AgentStatus }> = {
  approve: { from: ["pending"], to: "active" },
  // Rejecting an application is a removal that never started.
  reject: { from: ["pending"], to: "removed" },
  suspend: { from: ["active"], to: "suspended" },
  reinstate: { from: ["suspended"], to: "active" },
  remove: { from: ["active", "suspended"], to: "removed" },
};

export function agentTransition(
  from: AgentStatus,
  action: AgentAction,
): { ok: true; to: AgentStatus } | { ok: false; error: string } {
  const t = TRANSITIONS[action];
  if (!t) return { ok: false, error: "Unknown action." };
  if (!t.from.includes(from)) {
    return { ok: false, error: `Cannot ${action} an agent who is ${from}.` };
  }
  return { ok: true, to: t.to };
}

/** Which actions to offer for an agent in this status. */
export function actionsFor(status: AgentStatus): AgentAction[] {
  return (Object.keys(TRANSITIONS) as AgentAction[]).filter((a) =>
    TRANSITIONS[a].from.includes(status),
  );
}

/** Only an active agent's code attaches a new customer. */
export function codeAttaches(status: AgentStatus): boolean {
  return status === "active";
}
