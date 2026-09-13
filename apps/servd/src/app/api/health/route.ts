import { systemDb } from "@/server/tenancy/scoped-db";
import { getBillingStatus } from "@/server/billing/platform-settings";
import { parseHost } from "@/lib/host";

/**
 * Diagnostics: confirms env vars are present, the DB is reachable, the schema is
 * up to date, and plans are seeded. Returns only booleans/counts (no secrets).
 * Hit /api/health right after a deploy to verify everything's wired.
 */
export async function GET(req: Request) {
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    DATABASE_URL: !!process.env.DATABASE_URL,
    DIRECT_URL: !!process.env.DIRECT_URL,
    CREDENTIALS_ENCRYPTION_KEY: !!process.env.CREDENTIALS_ENCRYPTION_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? null,
  };

  // Multi-tenant routing: how THIS request's host is classified. For your
  // platform domain you want hostKind="platform". If it shows "custom", then
  // NEXT_PUBLIC_ROOT_DOMAIN is wrong/unset and the domain is misrouted as a tenant.
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? null;
  const requestHost = (req.headers.get("host") ?? "").split(":")[0].toLowerCase() || null;
  const routing = {
    NEXT_PUBLIC_ROOT_DOMAIN: rootDomain,
    requestHost,
    hostKind: requestHost ? parseHost(requestHost, rootDomain ?? undefined).kind : null,
  };

  // Optional features (present-or-not, never required for `healthy`).
  const features = {
    // Menu scanning and the content engine; dashboard insights are computed
    // from the shop's own figures and need no API key.
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    sms: !!process.env.SEMAPHORE_API_KEY,
  };

  // Custom-domain automation (Vercel API). When providerConfigured is true,
  // connecting a tenant domain auto-adds it to the project, verifies it, and
  // issues SSL. Booleans only — never the token itself.
  const domains = {
    providerConfigured: !!process.env.VERCEL_TOKEN && !!process.env.VERCEL_PROJECT_ID,
    VERCEL_TOKEN: !!process.env.VERCEL_TOKEN,
    VERCEL_PROJECT_ID: !!process.env.VERCEL_PROJECT_ID,
    VERCEL_TEAM_ID: !!process.env.VERCEL_TEAM_ID,
  };

  let db: Record<string, unknown> = { connected: false };
  try {
    db = await systemDb(async (tx) => {
      const planCount = await tx.plan.count();
      // Spot-check columns/tables added across later phases.
      const cols = await tx.$queryRaw<{ table_name: string; column_name: string }[]>`
        select table_name, column_name from information_schema.columns
        where table_schema = 'public' and (
          (table_name = 'restaurants' and column_name = 'onboardingCompletedAt') or
          (table_name = 'subscriptions' and column_name = 'trialEndsAt') or
          (table_name = 'menu_items' and column_name = 'videoUrl') or
          (table_name = 'orders' and column_name = 'inventoryDeductedAt') or
          (table_name = 'orders' and column_name = 'servedAt') or
          (table_name = 'orders' and column_name = 'discountAmount') or
          (table_name = 'orders' and column_name = 'orderType') or
          (table_name = 'orders' and column_name = 'customerLat') or
          (table_name = 'orders' and column_name = 'deliveryStatus') or
          (table_name = 'orders' and column_name = 'voidedAt') or
          (table_name = 'restaurants' and column_name = 'loyaltyEnabled') or
          (table_name = 'restaurants' and column_name = 'cashierVoidPin') or
          (table_name = 'restaurants' and column_name = 'customDomain')
        )`;
      const tables = await tx.$queryRaw<{ table_name: string }[]>`
        select table_name from information_schema.tables
        where table_schema = 'public' and table_name in
          ('plan_modules','restaurant_invoices','menu_item_translations','inventory_items','employees','promotions','loyalty_accounts','expenses','payroll_settings','menu_item_costs','storefront_settings','cash_movements','platform_settings')`;

      // Is the "daily" pay type present on the PayType enum?
      const enumRows = await tx.$queryRaw<{ ok: boolean }[]>`
        select exists(
          select 1 from pg_type t join pg_enum e on e.enumtypid = t.oid
          where t.typname = 'PayType' and e.enumlabel = 'daily'
        ) as ok`;
      const hasDailyPayType = enumRows[0]?.ok === true;

      const have = new Set([
        ...cols.map((c) => `${c.table_name}.${c.column_name}`),
        ...tables.map((t) => t.table_name),
      ]);
      const expected = [
        "restaurants.onboardingCompletedAt",
        "subscriptions.trialEndsAt",
        "menu_items.videoUrl",
        "orders.inventoryDeductedAt",
        "orders.servedAt",
        "orders.discountAmount",
        "orders.orderType",
        "orders.customerLat",
        "orders.deliveryStatus",
        "orders.voidedAt",
        "restaurants.loyaltyEnabled",
        "restaurants.cashierVoidPin",
        "restaurants.customDomain",
        "plan_modules",
        "restaurant_invoices",
        "menu_item_translations",
        "inventory_items",
        "employees",
        "promotions",
        "loyalty_accounts",
        "expenses",
        "payroll_settings",
        "menu_item_costs",
        "storefront_settings",
        "cash_movements",
        "platform_settings",
      ];
      const missing = expected.filter((e) => !have.has(e));
      if (!hasDailyPayType) missing.push("PayType.daily");

      return {
        connected: true,
        planCount,
        schemaCurrent: missing.length === 0,
        missing,
      };
    });
  } catch (e) {
    db = { connected: false, error: e instanceof Error ? e.message : "DB error" };
  }

  // Subscription billing provider status (Xendit / PayMongo).
  let billing: { provider: string | null; xenditConfigured: boolean } = { provider: null, xenditConfigured: false };
  try {
    billing = await getBillingStatus();
  } catch {
    /* platform_settings not migrated yet */
  }

  const healthy =
    Object.values(env).every((v) => v !== false && v !== null) &&
    db.connected === true &&
    db.schemaCurrent === true &&
    (db.planCount as number) > 0;

  return Response.json({ healthy, env, routing, features, domains, db, billing }, { status: healthy ? 200 : 503 });
}
