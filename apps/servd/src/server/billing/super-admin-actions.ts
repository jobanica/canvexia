"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma, PlanModuleType } from "@prisma/client";
import { systemDb } from "@/server/tenancy/scoped-db";
import { requireSuperAdmin } from "@/server/tenancy/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { runBillingCron, type CronSummary } from "@/server/billing/run-cron";
import { saveXenditCreds, setOrderCapEnabled, setUploadPostKey } from "@/server/billing/platform-settings";
import { provisionTrial, getFreePlan } from "@/server/billing/subscription";
import { COMP_FOREVER } from "@/lib/billing/comp";
import { uniqueSlug } from "@/lib/slug";
import { addMonths } from "@/lib/billing/period";
import { ALL_FEATURES, type Feature } from "@/lib/billing/features";
import { migrationHint } from "@/lib/db/migration-hint";
import { CUSTOM_DOMAIN_ADDON, CUSTOM_DOMAIN_PRICE } from "@/server/billing/addons";

export type ActionState =
  | { ok?: boolean; message?: string; error?: string; credentials?: { username: string; password: string } }
  | null;

/** Synthetic email domain for username-only logins (no mail is ever sent). */
const LOGIN_EMAIL_DOMAIN = process.env.INTERNAL_LOGIN_DOMAIN || "staff.servdph.com";

function syntheticEmail(username: string): string {
  return `${username}@${LOGIN_EMAIL_DOMAIN}`;
}

/** Short, readable temp password for handoff (no ambiguous characters). */
function tempPassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(10);
  let out = "";
  for (let i = 0; i < 10; i++) out += chars[bytes[i] % chars.length];
  return out;
}

const ALL_MODULES: PlanModuleType[] = ["hris", "inventory", "custom_domain"];

function refresh() {
  revalidatePath("/super-admin");
  revalidatePath("/super-admin/subscriptions");
  revalidatePath("/super-admin/plans");
  revalidatePath("/super-admin/invoices");
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

const planSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(60),
  price: z.coerce.number().min(0, "Price can't be negative"), // pesos (UI) → centavos
  trialDays: z.coerce.number().int().min(0).max(365),
  maxTables: z.coerce.number().int().min(0).optional(),
  maxStaff: z.coerce.number().int().min(0).optional(),
  smsIncluded: z.coerce.number().int().min(0).optional(),
});

function parsePlan(formData: FormData) {
  return planSchema.safeParse({
    name: formData.get("name"),
    price: formData.get("price"),
    trialDays: formData.get("trialDays"),
    maxTables: formData.get("maxTables") || undefined,
    maxStaff: formData.get("maxStaff") || undefined,
    smsIncluded: formData.get("smsIncluded") || undefined,
  });
}

function modulesFromForm(formData: FormData): PlanModuleType[] {
  return ALL_MODULES.filter((m) => formData.get(`module_${m}`) === "on");
}

function featuresFromForm(formData: FormData): Feature[] {
  return ALL_FEATURES.filter((f) => formData.get(`feature_${f}`) === "on");
}

/**
 * Persist a plan's enabled features. Runs in its OWN transaction (best-effort)
 * so a not-yet-migrated `features` column can't poison/roll back the main plan
 * save — and so changes apply live to every subscription on the plan.
 */
async function setPlanFeatures(planId: string, features: Feature[]): Promise<void> {
  try {
    await systemDb((tx) => tx.plan.update({ where: { id: planId }, data: { features } }));
  } catch {
    /* `plan.features` column not migrated yet — skip; tier defaults still apply */
  }
}

async function syncModules(tx: Prisma.TransactionClient, planId: string, modules: PlanModuleType[]) {
  const enabled = new Set(modules);
  for (const m of ALL_MODULES) {
    await tx.planModule.upsert({
      where: { planId_module: { planId, module: m } },
      create: { planId, module: m, enabled: enabled.has(m) },
      update: { enabled: enabled.has(m) },
    });
  }
}

function buildLimits(d: { maxTables?: number; maxStaff?: number; smsIncluded?: number }): Prisma.InputJsonValue {
  // Only include defined keys — Prisma rejects `undefined` inside a Json value,
  // and an omitted key means "unlimited" to the entitlements helper.
  const limits: Record<string, number> = {};
  if (d.maxTables !== undefined) limits.maxTables = d.maxTables;
  if (d.maxStaff !== undefined) limits.maxStaff = d.maxStaff;
  if (d.smsIncluded !== undefined) limits.smsIncluded = d.smsIncluded;
  return limits;
}

export async function createPlan(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSuperAdmin();
  const parsed = parsePlan(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { name, price, trialDays, maxTables, maxStaff, smsIncluded } = parsed.data;
  const priceMonthly = Math.round(price * 100);
  const limits = buildLimits({ maxTables, maxStaff, smsIncluded });
  let planId: string;
  try {
    planId = await systemDb(async (tx) => {
      const plan = await tx.plan.create({
        data: { name, priceMonthly, trialDays, limits, isActive: true },
        select: { id: true },
      });
      await syncModules(tx, plan.id, modulesFromForm(formData));
      return plan.id;
    });
  } catch (e) {
    console.error("createPlan failed", e);
    return { error: e instanceof Error ? e.message : "Couldn't create the plan." };
  }
  await setPlanFeatures(planId, featuresFromForm(formData));
  refresh();
  return { ok: true, message: `Plan “${name}” created.` };
}

export async function updatePlan(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSuperAdmin();
  const id = String(formData.get("id") ?? "");
  const parsed = parsePlan(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { name, price, trialDays, maxTables, maxStaff, smsIncluded } = parsed.data;
  const priceMonthly = Math.round(price * 100);
  const limits = buildLimits({ maxTables, maxStaff, smsIncluded });
  try {
    await systemDb(async (tx) => {
      await tx.plan.update({
        where: { id },
        data: {
          name,
          priceMonthly,
          trialDays,
          limits,
        },
      });
      await syncModules(tx, id, modulesFromForm(formData));
    });
  } catch (e) {
    console.error("updatePlan failed", e);
    return { error: e instanceof Error ? e.message : "Couldn't update the plan." };
  }
  await setPlanFeatures(id, featuresFromForm(formData));
  refresh();
  return { ok: true, message: "Plan updated." };
}

/** Activate / archive a plan (archived plans can't be picked for new signups). */
export async function togglePlanActive(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const id = String(formData.get("id"));
  const active = formData.get("active") === "true";
  await systemDb((tx) => tx.plan.update({ where: { id }, data: { isActive: active } }));
  refresh();
}

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

/** Ensure a restaurant has a subscription row, creating one if missing. */
async function ensureSubscription(tx: Prisma.TransactionClient, restaurantId: string, planId?: string) {
  const sub = await tx.subscription.findFirst({
    where: { restaurantId },
    orderBy: { createdAt: "desc" },
  });
  if (sub) return sub;
  const plan = planId
    ? await tx.plan.findUnique({ where: { id: planId }, select: { id: true } })
    : await tx.plan.findFirst({ where: { isActive: true }, orderBy: { priceMonthly: "asc" }, select: { id: true } });
  if (!plan) throw new Error("No plan available");
  return tx.subscription.create({
    data: { restaurantId, planId: plan.id, status: "trialing" },
  });
}

/** Move a restaurant onto a different plan (effective immediately). */
export async function assignPlan(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const restaurantId = String(formData.get("restaurantId"));
  const planId = String(formData.get("planId"));
  if (!planId) return;
  await systemDb(async (tx) => {
    const sub = await ensureSubscription(tx, restaurantId, planId);
    await tx.subscription.update({ where: { id: sub.id }, data: { planId }, select: { id: true } });
    await tx.restaurant.update({ where: { id: restaurantId }, data: { planId }, select: { id: true } });
  });
  refresh();
}

/** Master switch: turn the monthly order cap on/off for ALL restaurants. */
export async function setGlobalOrderCap(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  await setOrderCapEnabled(formData.get("enabled") === "true");
  refresh();
}

export type TempPasswordResult =
  | { ok: true; login: string; password: string }
  | { ok: false; error: string };

/**
 * Generate a fresh temporary password for a restaurant's OWNER (admin) login —
 * for when they forgot it (and never switched their username login to a real
 * email, so self-serve reset isn't possible). Returns the login handle + the
 * new password to hand over; the owner should change it after signing in.
 */
export async function resetOwnerPassword(restaurantId: string): Promise<TempPasswordResult> {
  await requireSuperAdmin();
  if (!restaurantId) return { ok: false, error: "Missing restaurant." };
  const owner = await systemDb((tx) =>
    tx.staffUser.findFirst({
      where: { restaurantId, role: "admin" },
      orderBy: { createdAt: "asc" },
      select: { authUserId: true, email: true, username: true },
    }),
  );
  if (!owner) return { ok: false, error: "No owner account found for this restaurant." };

  const password = tempPassword();
  try {
    const admin = createSupabaseAdminClient();
    const { error } = await admin.auth.admin.updateUserById(owner.authUserId, { password });
    if (error) return { ok: false, error: error.message };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't reset the password." };
  }
  const login = owner.username || owner.email;
  return { ok: true, login, password };
}

/** Features the hidden Lite save plan grants (online ordering + payments). */
const LITE_FEATURES: Feature[] = ["onlineOrdering", "onlinePayments"];

/**
 * One-click "Set to Lite": put a restaurant on the hidden ₱299 / 300-order save
 * plan and activate it. Creates the Lite plan the first time (so the founder
 * doesn't have to set it up), then assigns + activates. Existing Lite plan's
 * config is respected (features only seeded on first creation).
 */
export async function setToLite(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const restaurantId = String(formData.get("restaurantId"));
  if (!restaurantId) return;
  let createdPlanId: string | null = null;
  await systemDb(async (tx) => {
    let plan = await tx.plan.findFirst({
      where: { name: { equals: "Lite", mode: "insensitive" } },
      select: { id: true },
    });
    if (!plan) {
      plan = await tx.plan.create({
        data: { name: "Lite", priceMonthly: 29900, trialDays: 0, isActive: true, limits: {} },
        select: { id: true },
      });
      createdPlanId = plan.id;
    }
    const sub = await ensureSubscription(tx, restaurantId, plan.id);
    await tx.subscription.update({
      where: { id: sub.id },
      data: { planId: plan.id, status: "active", failedCharges: 0, cancelAtPeriodEnd: false },
      select: { id: true },
    });
    await tx.restaurant.update({ where: { id: restaurantId }, data: { planId: plan.id, status: "active" }, select: { id: true } });
  });
  if (createdPlanId) await setPlanFeatures(createdPlanId, LITE_FEATURES);
  refresh();
}

const STATUSES = ["trialing", "active", "past_due", "cancelled"] as const;

/** Force a subscription status (and keep the restaurant access in sync). */
export async function setSubscriptionStatus(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const restaurantId = String(formData.get("restaurantId"));
  const status = String(formData.get("status"));
  if (!STATUSES.includes(status as (typeof STATUSES)[number])) return;
  await systemDb(async (tx) => {
    const sub = await ensureSubscription(tx, restaurantId);
    await tx.subscription.update({
      where: { id: sub.id },
      data: {
        status: status as (typeof STATUSES)[number],
        // Re-activating clears the dunning counter and cancel flag.
        ...(status === "active" ? { failedCharges: 0, cancelAtPeriodEnd: false } : {}),
      },
      select: { id: true },
    });
    // Active/trialing → restore access; cancelled/past_due → suspend access.
    const restaurantStatus = status === "active" || status === "trialing" ? "active" : "suspended";
    await tx.restaurant.update({ where: { id: restaurantId }, data: { status: restaurantStatus }, select: { id: true } });
  });
  refresh();
}

/** Extend (or start) the free trial by N days from today. */
export async function extendTrial(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const restaurantId = String(formData.get("restaurantId"));
  const days = Math.max(1, Math.min(365, Number(formData.get("days") ?? 0)));
  if (!days) return;
  await systemDb(async (tx) => {
    const sub = await ensureSubscription(tx, restaurantId);
    // Extend from the later of "now" and the current trial end.
    const base = sub.trialEndsAt && sub.trialEndsAt > new Date() ? sub.trialEndsAt : new Date();
    const trialEndsAt = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
    await tx.subscription.update({
      where: { id: sub.id },
      data: { status: "trialing", trialEndsAt, currentPeriodEnd: trialEndsAt, cancelAtPeriodEnd: false },
      select: { id: true },
    });
    await tx.restaurant.update({ where: { id: restaurantId }, data: { status: "active" }, select: { id: true } });
  });
  refresh();
}

/**
 * Comp a free month: mark active and push the paid period out a month with no
 * charge. Handy for partnerships / making good on an outage.
 */
export async function compMonth(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const restaurantId = String(formData.get("restaurantId"));
  await systemDb(async (tx) => {
    const sub = await ensureSubscription(tx, restaurantId);
    const base = sub.currentPeriodEnd && sub.currentPeriodEnd > new Date() ? sub.currentPeriodEnd : new Date();
    await tx.subscription.update({
      where: { id: sub.id },
      data: { status: "active", currentPeriodEnd: addMonths(base, 1), failedCharges: 0, cancelAtPeriodEnd: false },
      select: { id: true },
    });
    await tx.restaurant.update({ where: { id: restaurantId }, data: { status: "active" }, select: { id: true } });
  });
  refresh();
}

/**
 * Manually upgrade a subscriber to FULL ACCESS without payment. Implemented as a
 * complimentary trial: a trialing subscription unlocks every feature, and the
 * billing cron never bills or suspends a trial that hasn't ended — so a far-out
 * (or chosen) end date = free access to everything until you revoke it.
 */
export async function grantFullAccess(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireSuperAdmin();
    const restaurantId = String(formData.get("restaurantId"));
    const duration = String(formData.get("duration") ?? "forever");
    const months: Record<string, number> = { "1m": 1, "3m": 3, "12m": 12 };
    const trialEndsAt = duration in months ? addMonths(new Date(), months[duration]) : COMP_FOREVER;
    await systemDb(async (tx) => {
      const sub = await ensureSubscription(tx, restaurantId);
      // select: { id } so Prisma's RETURNING doesn't reference schema-lagged
      // columns the live DB may not have yet (that was the 500 source).
      await tx.subscription.update({
        where: { id: sub.id },
        data: {
          status: "trialing",
          trialEndsAt,
          currentPeriodEnd: trialEndsAt,
          cancelAtPeriodEnd: false,
          failedCharges: 0,
        },
        select: { id: true },
      });
      await tx.restaurant.update({
        where: { id: restaurantId },
        data: { status: "active" },
        select: { id: true },
      });
    });
  } catch (e) {
    console.error("grantFullAccess failed", e);
    return { error: e instanceof Error ? e.message : "Couldn't grant access." };
  }
  refresh();
  return { ok: true, message: "Full access granted." };
}

/** End complimentary access — drop the subscriber back to the Free plan (active). */
export async function revokeFullAccess(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireSuperAdmin();
    const restaurantId = String(formData.get("restaurantId"));
    await systemDb(async (tx) => {
      const sub = await ensureSubscription(tx, restaurantId);
      const free = await getFreePlan(tx);
      await tx.subscription.update({
        where: { id: sub.id },
        data: {
          ...(free ? { planId: free.id } : {}),
          status: "active",
          trialEndsAt: null,
          cancelAtPeriodEnd: false,
          failedCharges: 0,
        },
        select: { id: true },
      });
      await tx.restaurant.update({
        where: { id: restaurantId },
        data: { ...(free ? { planId: free.id } : {}), status: "active" },
        select: { id: true },
      });
    });
  } catch (e) {
    console.error("revokeFullAccess failed", e);
    return { error: e instanceof Error ? e.message : "Couldn't revoke access." };
  }
  refresh();
  return { ok: true, message: "Access revoked — moved to Free." };
}

/** Suspend / restore a restaurant's access without touching the subscription. */
export async function setRestaurantAccess(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const restaurantId = String(formData.get("restaurantId"));
  const access = String(formData.get("access")); // "active" | "suspended"
  if (access !== "active" && access !== "suspended") return;
  await systemDb((tx) => tx.restaurant.update({ where: { id: restaurantId }, data: { status: access }, select: { id: true } }));
  refresh();
}

// ---------------------------------------------------------------------------
// One-time add-ons (custom-domain unlock)
// ---------------------------------------------------------------------------

/**
 * Grant or revoke the one-time custom-domain unlock by hand. Needed when a
 * customer has paid but the gateway webhook didn't reach us (or they paid
 * out-of-band, e.g. bank transfer), and to comp it.
 */
export async function setCustomDomainUnlock(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const restaurantId = String(formData.get("restaurantId"));
  const grant = String(formData.get("grant")) === "1";
  if (!restaurantId) return;

  await systemDb(async (tx) => {
    const existing = await tx.addonPurchase.findFirst({
      where: { restaurantId, addon: CUSTOM_DOMAIN_ADDON },
      orderBy: { createdAt: "desc" },
    });

    if (!grant) {
      // Revoke: settled rows become void so access is lost but the record stays.
      if (existing) {
        await tx.addonPurchase.updateMany({
          where: { restaurantId, addon: CUSTOM_DOMAIN_ADDON, status: "paid" },
          data: { status: "void" },
        });
      }
      return;
    }

    if (existing && existing.status !== "paid") {
      await tx.addonPurchase.update({
        where: { id: existing.id },
        data: { status: "paid", paidAt: new Date() },
      });
      return;
    }
    if (!existing) {
      await tx.addonPurchase.create({
        data: {
          restaurantId,
          addon: CUSTOM_DOMAIN_ADDON,
          amount: CUSTOM_DOMAIN_PRICE,
          status: "paid",
          paidAt: new Date(),
        },
      });
    }
  });
  revalidatePath("/admin/domains");
  refresh();
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

export async function markInvoicePaid(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const id = String(formData.get("id"));
  await systemDb((tx) =>
    tx.restaurantInvoice.update({ where: { id }, data: { status: "paid", paidAt: new Date() } }),
  );
  refresh();
}

export async function voidInvoice(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const id = String(formData.get("id"));
  await systemDb((tx) => tx.restaurantInvoice.update({ where: { id }, data: { status: "void" } }));
  refresh();
}

// ---------------------------------------------------------------------------
// Billing run
// ---------------------------------------------------------------------------

export type CronState = { ok?: boolean; summary?: CronSummary; error?: string } | null;

/** Run the daily billing cycle on demand (charges/dunning/suspensions). */
export async function runBillingNow(_prev: CronState, _formData: FormData): Promise<CronState> {
  await requireSuperAdmin();
  try {
    const summary = await runBillingCron();
    refresh();
    return { ok: true, summary };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Billing run failed." };
  }
}

// ---------------------------------------------------------------------------
// Payments (Xendit) — subscription billing provider
// ---------------------------------------------------------------------------

/** Save the platform's Xendit credentials (encrypted) for subscription billing. */
export async function saveXenditSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSuperAdmin();
  const secretKey = String(formData.get("secretKey") ?? "").trim();
  const callbackToken = String(formData.get("callbackToken") ?? "").trim();
  if (!secretKey || !/^xnd_/.test(secretKey)) {
    return { error: "Enter your Xendit secret key (starts with xnd_)." };
  }
  if (!callbackToken) return { error: "Enter your Xendit webhook callback token." };
  try {
    await saveXenditCreds({ secretKey, callbackToken });
  } catch (e) {
    console.error("saveXenditSettings failed", e);
    return { error: e instanceof Error ? e.message : "Couldn't save. Run the migration if you haven't yet." };
  }
  revalidatePath("/super-admin/payments");
  return { ok: true, message: "Xendit connected. Subscriptions will activate automatically on payment." };
}

// ---------------------------------------------------------------------------
// Accounts — provision restaurant logins with the email pre-confirmed
// ---------------------------------------------------------------------------

const accountSchema = z.object({
  restaurantName: z.string().trim().min(2, "Restaurant name is required").max(80),
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
});

/**
 * Super-admin: create a restaurant + owner login with the email PRE-CONFIRMED
 * (via the Supabase admin API), so the owner can sign in immediately — no
 * confirmation email needed. Provisions the tenant + admin staff + free trial,
 * exactly like self-serve signup.
 */
export async function createRestaurantAccount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSuperAdmin();
  const parsed = accountSchema.safeParse({
    restaurantName: formData.get("restaurantName"),
    email: formData.get("email"),
    password: formData.get("password"),
    phone: formData.get("phone") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { restaurantName, email, password, phone } = parsed.data;

  // 1. Create the auth user, email pre-confirmed (no confirmation link).
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    return { error: /registered|exists/i.test(error?.message ?? "") ? "That email already has an account." : error?.message ?? "Couldn't create the login." };
  }
  const authUserId = data.user.id;

  // 2. Provision the tenant + owner + trial.
  try {
    await systemDb(async (tx) => {
      const slug = await uniqueSlug(restaurantName, async (s) => {
        const hit = await tx.restaurant.findUnique({ where: { slug: s }, select: { id: true } });
        return !!hit;
      });
      const restaurant = await tx.restaurant.create({
        data: {
          name: restaurantName,
          displayName: restaurantName,
          slug,
          status: "active",
          ...(phone ? { printerConfig: { receipt: { phone } } as unknown as Prisma.InputJsonValue } : {}),
          staff: { create: { authUserId, role: "admin", email } },
        },
        select: { id: true },
      });
      await provisionTrial(tx, restaurant.id);
    });
  } catch (e) {
    // Roll back the orphaned auth user so the email can be reused.
    try {
      await admin.auth.admin.deleteUser(authUserId);
    } catch {
      /* ignore */
    }
    const msg = e instanceof Error ? e.message : "Couldn't create the account.";
    if (/unique/i.test(msg)) return { error: "That email already has an account." };
    return { error: migrationHint(e, "full-schema-sync.sql", msg) };
  }

  refresh();
  return { ok: true, message: `Account created for ${restaurantName} — they can log in right away.` };
}

const businessSchema = z.object({
  restaurantName: z.string().trim().min(2, "Business name is required").max(80),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Username must be at least 3 characters")
    .max(30)
    .regex(/^[a-z0-9._-]+$/, "Username can use letters, numbers, dot, dash, underscore"),
  businessAddress: z.string().trim().max(300).optional().or(z.literal("")),
  latitude: z.coerce.number().min(-90).max(90).optional().or(z.literal("")),
  longitude: z.coerce.number().min(-180).max(180).optional().or(z.literal("")),
});

/**
 * Super-admin: create a business by NAME + USERNAME (no email). We generate a
 * temporary password and provision a username-based login; the owner signs in
 * with the username + temp password and sets their real email/password from the
 * dashboard. Address + map pin are recorded so the super-admin can visit anytime.
 */
export async function createBusinessAccount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSuperAdmin();
  const parsed = businessSchema.safeParse({
    restaurantName: formData.get("restaurantName"),
    username: formData.get("username"),
    businessAddress: formData.get("businessAddress") ?? "",
    latitude: formData.get("latitude") ?? "",
    longitude: formData.get("longitude") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { restaurantName, username, businessAddress } = parsed.data;
  const latitude = typeof parsed.data.latitude === "number" ? parsed.data.latitude : null;
  const longitude = typeof parsed.data.longitude === "number" ? parsed.data.longitude : null;

  // Username must be unique (it's how they log in).
  const taken = await systemDb((tx) => tx.staffUser.findFirst({ where: { username }, select: { id: true } }));
  if (taken) return { error: "That username is already taken." };

  // Create the login under a synthetic email (no mail is ever sent).
  const password = tempPassword();
  const email = syntheticEmail(username);
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) {
    return { error: /registered|exists/i.test(error?.message ?? "") ? "That username is already taken." : error?.message ?? "Couldn't create the login." };
  }
  const authUserId = data.user.id;

  try {
    await systemDb(async (tx) => {
      const slug = await uniqueSlug(restaurantName, async (s) => {
        const hit = await tx.restaurant.findUnique({ where: { slug: s }, select: { id: true } });
        return !!hit;
      });
      const restaurant = await tx.restaurant.create({
        data: {
          name: restaurantName,
          displayName: restaurantName,
          slug,
          status: "active",
          businessAddress: businessAddress || null,
          latitude,
          longitude,
          staff: { create: { authUserId, role: "admin", email, username } },
        },
        select: { id: true },
      });
      await provisionTrial(tx, restaurant.id);
    });
  } catch (e) {
    try {
      await admin.auth.admin.deleteUser(authUserId);
    } catch {
      /* ignore */
    }
    const msg = e instanceof Error ? e.message : "Couldn't create the business.";
    if (/unique/i.test(msg)) return { error: "That username or business already exists." };
    return { error: migrationHint(e, "full-schema-sync.sql", msg) };
  }

  refresh();
  revalidatePath("/super-admin/accounts");
  return {
    ok: true,
    message: `${restaurantName} created. Give the owner these login details — they can change their email & password from the dashboard:`,
    credentials: { username, password },
  };
}

/** Save (or clear) the platform-wide Upload-Post API key for social scheduling. */
export async function saveUploadPostKey(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSuperAdmin();
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  // Blank = keep whatever is stored (the field never echoes the saved key).
  if (!apiKey) return { ok: true, message: "Unchanged." };
  try {
    await setUploadPostKey(apiKey);
  } catch {
    return { error: "Couldn't save. Run the social-posts migration if you haven't yet." };
  }
  revalidatePath("/super-admin/payments");
  return { ok: true, message: "Upload-Post connected." };
}

// ------------------------------------------------- monthly-feature comping

/**
 * Switch on a feature that is sold as its own monthly subscription — today,
 * that's the content scheduler (₱499/mo).
 *
 * This exists because nothing else could do it. Monthly features are
 * deliberately excluded from plan grants AND from the trial's blanket unlock
 * (see feature-gate.ts, which strips them from the set before re-adding only
 * live subscriptions). So ticking the feature on a plan does nothing, buying it
 * as a one-time add-on does nothing, and even "Grant full access" — which
 * unlocks everything else — leaves it off. The only route in was a paid
 * checkout, which is no use for a demo account, a partner, or anyone being
 * comped.
 *
 * Complimentary access is an active subscription whose period ends in 2099.
 * That's the same sentinel a comped plan trial uses, and it keeps the renewal
 * cron away by construction rather than by a flag someone has to remember to
 * check: the cron looks for subscriptions expiring soon, and this one never is.
 * Nobody gets charged, and no invoice is raised.
 */
export async function grantMonthlyFeature(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireSuperAdmin();
    const restaurantId = String(formData.get("restaurantId"));
    const feature = String(formData.get("feature"));
    const { MONTHLY_FEATURES } = await import("@/server/billing/feature-subscriptions");
    const meta = MONTHLY_FEATURES[feature];
    if (!meta) return { error: "That isn't a monthly feature." };

    await systemDb((tx) =>
      tx.featureSubscription.upsert({
        where: { restaurantId_feature: { restaurantId, feature } },
        create: {
          restaurantId,
          feature,
          status: "active",
          // The list price is snapshotted even though nothing is charged, so
          // reports on what a comp is worth stay honest.
          priceMonthly: meta.priceMonthly,
          currentPeriodEnd: COMP_FOREVER,
        },
        // Only the columns this actually needs. Writing renewUrl here — which
        // a comp never has — made the whole upsert fail on a database that
        // hadn't run the migration adding it, for a value of null.
        update: { status: "active", currentPeriodEnd: COMP_FOREVER },
        select: { id: true },
      }),
    );
    return { ok: true, message: `${meta.label} switched on (complimentary).` };
  } catch (e) {
    console.error("grantMonthlyFeature failed", e);
    return { error: migrationHint(e, "add-feature-subscriptions.sql") };
  } finally {
    refresh();
  }
}

/** Turn a monthly feature back off. Cancels rather than deletes, so the history stays. */
export async function revokeMonthlyFeature(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireSuperAdmin();
    const restaurantId = String(formData.get("restaurantId"));
    const feature = String(formData.get("feature"));
    await systemDb((tx) =>
      tx.featureSubscription.updateMany({
        where: { restaurantId, feature },
        data: { status: "cancelled" },
      }),
    );
    return { ok: true, message: "Switched off." };
  } catch (e) {
    console.error("revokeMonthlyFeature failed", e);
    return { error: migrationHint(e, "add-feature-subscriptions.sql") };
  } finally {
    refresh();
  }
}

/**
 * Grandfather (or un-grandfather) an account's unlimited table QRs.
 *
 * The migration sets this for everyone who predates the change; this is for the
 * cases it can't know about — a customer who was promised unlimited during a
 * sales conversation, an account created in the window between the deploy and
 * the migration, a partner's demo. Separate from the one-time unlock on
 * purpose: that records a sale, this records a promise.
 */
export async function setQrGrandfathered(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const restaurantId = String(formData.get("restaurantId"));
  const grant = String(formData.get("grant")) === "1";
  if (!restaurantId) return;
  try {
    await systemDb((tx) =>
      tx.restaurant.updateMany({ where: { id: restaurantId }, data: { qrGrandfathered: grant } }),
    );
  } catch (e) {
    console.error("setQrGrandfathered failed", e);
  }
  revalidatePath("/admin/tables");
  refresh();
}

/**
 * Grant or revoke a one-time feature unlock without payment.
 *
 * Generalised from the custom-domain version, which was the same twenty lines
 * hard-coded to one addon key — and there are now two of them.
 */
export async function setAddonUnlock(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const restaurantId = String(formData.get("restaurantId"));
  const addon = String(formData.get("addon"));
  const amount = Number(formData.get("amount") ?? 0) || 0;
  const grant = String(formData.get("grant")) === "1";
  if (!restaurantId || !addon) return;

  await systemDb(async (tx) => {
    const existing = await tx.addonPurchase.findFirst({
      where: { restaurantId, addon },
      orderBy: { createdAt: "desc" },
    });

    if (!grant) {
      // Revoke: a settled row becomes void, so access goes but the record of
      // the sale stays. Deleting it would lose the fact that money changed hands.
      if (existing) {
        await tx.addonPurchase.updateMany({
          where: { restaurantId, addon, status: "paid" },
          data: { status: "void" },
        });
      }
      return;
    }
    if (existing && existing.status !== "paid") {
      await tx.addonPurchase.update({
        where: { id: existing.id },
        data: { status: "paid", paidAt: new Date() },
      });
      return;
    }
    if (!existing) {
      await tx.addonPurchase.create({
        data: { restaurantId, addon, amount, status: "paid", paidAt: new Date() },
      });
    }
  });
  revalidatePath("/admin/tables");
  revalidatePath("/admin/domains");
  refresh();
}
