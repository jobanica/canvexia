// Creates login accounts: a Supabase Auth user + the linked Servd profile row.
// The seed creates restaurants but no logins, so run this to get in.
//
// Usage (note the `--` so npm passes the args through):
//   npm run user:create -- superadmin <email> <password> [ops]
//   npm run user:create -- staff <restaurantSlug> <kitchen|cashier|admin> <email> <password>
//
// Examples:
//   npm run user:create -- superadmin me@servd.app 'StrongPass123!'
//   npm run user:create -- superadmin ops@servd.app 'StrongPass123!' ops
//   npm run user:create -- staff mango-grill admin owner@mango.test 'StrongPass123!'
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

for (const f of [".env", ".env.local"]) {
  try {
    process.loadEnvFile(f);
  } catch {
    /* ignore */
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (.env.local).");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const prisma = new PrismaClient();

// Run a Prisma block in the trusted super-admin context (bypasses tenant RLS).
function asSuper(fn) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select set_config('app.is_super_admin', 'on', true)`;
    return fn(tx);
  });
}

async function createAuthUser(email, password) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // skip the confirmation email for staff accounts
  });
  if (error) throw new Error(`Supabase auth: ${error.message}`);
  return data.user.id;
}

async function main() {
  const [kind, ...rest] = process.argv.slice(2);

  if (kind === "superadmin") {
    const [email, password, scope] = rest;
    if (!email || !password) {
      throw new Error("Usage: superadmin <email> <password> [ops]");
    }
    // Anything other than an explicit "ops" is full access. Stored as NULL so
    // it reads the same as every admin row created before roles existed.
    if (scope && scope !== "ops") throw new Error('Third arg, if given, must be "ops"');
    const role = scope === "ops" ? "ops" : null;

    const authUserId = await createAuthUser(email, password);
    await asSuper((tx) => tx.platformAdmin.create({ data: { authUserId, email, role } }));
    console.log(`✅ Super-admin created: ${email}${role ? ` (${role})` : " (full access)"}`);
    return;
  }

  if (kind === "staff") {
    const [slug, role, email, password] = rest;
    if (!slug || !role || !email || !password) {
      throw new Error("Usage: staff <restaurantSlug> <kitchen|cashier|admin> <email> <password>");
    }
    if (!["kitchen", "cashier", "admin"].includes(role)) {
      throw new Error("role must be kitchen, cashier, or admin");
    }
    const restaurant = await asSuper((tx) =>
      tx.restaurant.findUnique({ where: { slug }, select: { id: true, name: true } }),
    );
    if (!restaurant) throw new Error(`No restaurant with slug "${slug}"`);

    const authUserId = await createAuthUser(email, password);
    await asSuper((tx) =>
      tx.staffUser.create({
        data: { restaurantId: restaurant.id, authUserId, role, email },
      }),
    );
    console.log(`✅ ${role} created for ${restaurant.name}: ${email}`);
    return;
  }

  throw new Error(
    "First arg must be 'superadmin' or 'staff'. See the comment at the top of this file.",
  );
}

main()
  .catch((e) => {
    console.error("❌", e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
