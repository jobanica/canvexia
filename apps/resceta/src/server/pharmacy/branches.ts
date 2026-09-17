import "server-only";
import { cookies } from "next/headers";
import type { Prisma } from "@prisma/client";
import { pharmacyDb, systemDb } from "@/server/tenancy/scoped-db";

/**
 * BRANCHES.
 *
 * A pharmacy that opens a second shop keeps one catalogue, one staff list, one
 * receipt series and one set of customers — and needs two sets of STOCK. That
 * is the whole of what a branch is here: a place stock sits, a till it is sold
 * from, and a column on the rows that record both.
 *
 * NULL MEANS THE MAIN BRANCH, everywhere. Every pre-branch row was backfilled,
 * but a row written by a path that has not been taught about branches must land
 * somewhere real rather than vanishing from every per-branch total. `resolve`
 * below is the one place that rule lives.
 */

export const BRANCH_COOKIE = "resceta_branch";

export interface BranchRow {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  isMain: boolean;
  isActive: boolean;
}

export async function listBranches(pharmacyId: string): Promise<BranchRow[]> {
  return pharmacyDb(pharmacyId, (tx) =>
    tx.pharmacyBranch.findMany({
      orderBy: [{ isMain: "desc" }, { name: "asc" }],
      select: { id: true, name: true, address: true, phone: true, isMain: true, isActive: true },
    }),
  );
}

export async function mainBranch(pharmacyId: string): Promise<BranchRow | null> {
  return pharmacyDb(pharmacyId, (tx) =>
    tx.pharmacyBranch.findFirst({
      where: { isMain: true },
      select: { id: true, name: true, address: true, phone: true, isMain: true, isActive: true },
    }),
  );
}

export interface BranchContext {
  branches: BranchRow[];
  /** The branch in play, or null when the whole pharmacy is selected. */
  current: BranchRow | null;
  /** True when the selection spans every branch. Reads only — never writes. */
  all: boolean;
  /** Where a write should file its rows. Never null when any branch exists. */
  writeBranchId: string | null;
  /** Whether the concept is worth showing at all. */
  multi: boolean;
}

/**
 * Which branch this request is looking at.
 *
 * "ALL" IS A READING POSITION, NOT A WRITING ONE. A report may span branches; a
 * sale, a delivery or a count may not — stock has to land somewhere. So every
 * write uses `writeBranchId`, which falls back to the main branch rather than
 * ever being null while a branch exists.
 */
export async function branchContext(pharmacyId: string): Promise<BranchContext> {
  const branches = await listBranches(pharmacyId);
  const active = branches.filter((b) => b.isActive);
  const main = branches.find((b) => b.isMain) ?? branches[0] ?? null;

  const chosen = (await cookies()).get(BRANCH_COOKIE)?.value ?? "";
  if (chosen === "all") {
    return {
      branches: active,
      current: null,
      all: true,
      writeBranchId: main?.id ?? null,
      multi: active.length > 1,
    };
  }

  // A cookie naming a branch that does not exist (deleted, or another
  // pharmacy's) falls back to the main branch rather than showing nothing.
  const current = active.find((b) => b.id === chosen) ?? main;
  return {
    branches: active,
    current: current ?? null,
    all: false,
    writeBranchId: current?.id ?? null,
    multi: active.length > 1,
  };
}

/**
 * The `where` fragment for a branch-scoped read.
 *
 * NULL IS INCLUDED ALONGSIDE THE MAIN BRANCH, as an OR rather than a plain
 * equality. A row whose branchId never got written belongs to the main branch
 * by the rule at the top of this file, and `branchId: x` alone would hide it —
 * which is how stock would silently disappear from the only branch most
 * pharmacies will ever have.
 */
export function branchWhere(ctx: BranchContext): {
  OR?: { branchId: string | null }[];
  branchId?: string;
} {
  if (ctx.all || !ctx.current) return {};
  return ctx.current.isMain
    ? { OR: [{ branchId: ctx.current.id }, { branchId: null }] }
    : { branchId: ctx.current.id };
}

export async function saveBranch(input: {
  pharmacyId: string;
  branchId: string | null;
  name: string;
  address: string | null;
  phone: string | null;
  isActive: boolean;
  actorStaffId: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    return await systemDb(async (tx) => {
      if (input.branchId) {
        const existing = await tx.pharmacyBranch.findFirst({
          where: { id: input.branchId, pharmacyId: input.pharmacyId },
          select: { id: true, isMain: true },
        });
        if (!existing) return { ok: false as const, error: "That branch was not found." };
        if (existing.isMain && !input.isActive) {
          // The main branch is where null-branch rows resolve to and where
          // every write falls back. Closing it would leave stock nowhere.
          return { ok: false as const, error: "The main branch cannot be closed." };
        }
        await tx.pharmacyBranch.update({
          where: { id: existing.id },
          data: {
            name: input.name,
            address: input.address,
            phone: input.phone,
            isActive: input.isActive,
          },
        });
        await audit(tx, input.actorStaffId, "pharmacy.branch_updated", existing.id, {
          name: input.name,
        });
        return { ok: true as const, id: existing.id };
      }

      const created = await tx.pharmacyBranch.create({
        data: {
          pharmacyId: input.pharmacyId,
          name: input.name,
          address: input.address,
          phone: input.phone,
          isActive: input.isActive,
          // Never a second main. The partial unique index would refuse it
          // anyway; saying so here makes the error a sentence instead of a
          // constraint violation.
          isMain: false,
        },
        select: { id: true },
      });
      await audit(tx, input.actorStaffId, "pharmacy.branch_created", created.id, {
        name: input.name,
      });
      return { ok: true as const, id: created.id };
    });
  } catch {
    return { ok: false, error: "Couldn't save that branch. Try again." };
  }
}

async function audit(
  tx: Prisma.TransactionClient,
  actorStaffId: string,
  action: string,
  entityId: string,
  after: unknown,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorType: "merchant",
      actorStaffId,
      action,
      entityType: "pharmacy_branch",
      entityId,
      after: after as Prisma.InputJsonValue,
    },
  });
}
