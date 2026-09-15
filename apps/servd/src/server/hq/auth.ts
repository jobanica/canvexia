import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  hqCan,
  requireHqCapability,
  parseHqRole,
  type HqCapability,
  type HqUserRole,
} from "@servd/core";
import { hitRateLimitIn, RATE_WINDOW_MS } from "@servd/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { systemDb } from "@/server/tenancy/scoped-db";
import { writeHqAudit } from "@/server/audit/log";

/**
 * Who is signed into the CANVEXIA HQ console.
 *
 * ONE identity table, `platform_admins`, and no second path — unlike the
 * partner portal, which carries two because it had live sessions to preserve.
 * There is nothing to preserve here: that table has zero rows. The first seat
 * arrives through `packages/db/prisma/manual/bootstrap-hq-admin.sql` and every
 * seat after it from /hq/team.
 *
 * WHAT THIS IS NOT. It is not an RLS boundary. Both HQ roles run in a
 * super-admin context and can read every row in the schema — that is what an HQ
 * console is for. The capability matrix in packages/core is the only thing
 * between someone hired to work the pipeline and the ability to change what
 * every merchant in the country pays, which is why the checks below are at the
 * ACTION and not only in the layout.
 */
export interface CurrentHqUser {
  id: string;
  authUserId: string;
  email: string;
  displayName: string | null;
  role: HqUserRole;
}

/** Does this seat hold a capability? For rendering; not a gate on its own. */
export function hqUserCan(user: CurrentHqUser, capability: HqCapability): boolean {
  return hqCan(user.role, capability);
}

export async function getCurrentHqUser(): Promise<CurrentHqUser | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  try {
    const row = await systemDb((tx) =>
      tx.platformAdmin.findUnique({
        where: { authUserId: user.id },
        // Named columns, not a bare findUnique. This is the query that decides
        // who you are — if it throws, nobody can log in — and Prisma returns
        // every scalar when there is no select, so a column added to this model
        // later must not be able to reach this line.
        select: {
          id: true,
          email: true,
          displayName: true,
          role: true,
          status: true,
        },
      }),
    );
    if (!row) return null;
    // A deactivated seat is KEPT so the audit log's actor stays resolvable, but
    // it does not sign in. `status` is defaulted in the database, so a row from
    // before that column existed reads as "active", which is what it was.
    if (row.status === "deactivated") return null;
    return {
      id: row.id,
      authUserId: user.id,
      email: row.email,
      displayName: row.displayName,
      role: parseHqRole(row.role),
    };
  } catch {
    // platform_admins not migrated yet. Null, not a 500 — and there is nothing
    // to fall back to, because there is no second identity path here.
    return null;
  }
}

/**
 * Gate an HQ page. Redirects to the HQ login when not an HQ seat.
 *
 * `/hq/login`, NOT `/login`. Servd's staff login says "sign in to your
 * restaurant's dashboard" and routes by staff role; sending an HQ admin there
 * lands them in one product's back office, which is the wrong console and the
 * wrong company's brand.
 */
export async function requireHqPage(capability?: HqCapability): Promise<CurrentHqUser> {
  const user = await getCurrentHqUser();
  if (!user) redirect("/hq/login");
  // Redirects to the HQ home rather than to login: an ops admin who guesses
  // /hq/billing is signed in correctly and simply does not hold it, and
  // bouncing them to a login form would read as a broken session.
  if (capability && !hqCan(user.role, capability)) redirect("/hq");
  return user;
}

/**
 * Gate a server action on a capability as well as a session.
 *
 * Separate from the page guard, and NOT decided by the request path: a server
 * action is reachable by its id from any page, so gating on "which screen was
 * open" would let an ops admin invoke a billing adjustment from a screen they
 * are allowed on. Each module states what it needs.
 *
 * Throws rather than redirecting so the action can surface an error mid-submit.
 */
export async function requireHqAction(capability: HqCapability): Promise<CurrentHqUser> {
  const user = await getCurrentHqUser();
  if (!user) throw new Error("UNAUTHORIZED");
  requireHqCapability(user.role, capability);
  return user;
}

// ----------------------------------------------------------------------------
// Login: rate limiting and the audit row.
//
// Neither existed on any login in this codebase. The brief asks for both on HQ,
// which is the right place to start: this is the door to every partner's
// commercial terms and every merchant's data in the country.
// ----------------------------------------------------------------------------

/** Per-hour allowance, per IP, for HQ sign-in attempts. */
const HQ_LOGIN_LIMIT = 10;

/** Hashed client IP. We need to tell requesters apart, not to know who they are. */
async function clientKey(): Promise<string> {
  const h = await headers();
  const raw =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip")?.trim() ||
    "unknown";
  return createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

/**
 * Counts one HQ sign-in attempt.
 *
 * Fails CLOSED, unlike the public builder's limiter which fails open. That one
 * guards a marketing funnel and letting a request through is the safe error;
 * this one guards the HQ console, and an unavailable counter is not a reason to
 * stop counting attempts against it.
 */
export async function rateLimitHqLogin(): Promise<{ ok: boolean; error?: string }> {
  const key = await clientKey();
  try {
    const row = await systemDb((tx) =>
      hitRateLimitIn(tx, "hq:login", key, RATE_WINDOW_MS),
    );
    if (row.count > HQ_LOGIN_LIMIT) {
      return { ok: false, error: "Too many sign-in attempts. Try again in an hour." };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Sign-in is temporarily unavailable. Try again shortly." };
  }
}

/**
 * Record a sign-in attempt, successful or not.
 *
 * The EMAIL and the outcome, never the password and never a token. A failed
 * attempt is recorded with the email as typed, because "somebody tried this
 * address forty times" is the thing the log is for.
 *
 * Best-effort: a failed audit write must not stop a legitimate sign-in, which
 * is the one place in the HQ console where the trade goes that way — a locked
 * -out founder cannot fix the thing that locked them out.
 */
export async function recordHqLogin(email: string, ok: boolean): Promise<void> {
  try {
    await systemDb((tx) =>
      writeHqAudit(tx, {
        actorEmail: email,
        action: ok ? "hq.login" : "hq.login_failed",
        entityType: "platform_admin",
        after: { ok },
      }),
    );
  } catch {
    /* never block a sign-in on the audit row */
  }
}
