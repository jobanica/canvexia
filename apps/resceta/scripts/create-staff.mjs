// Creates a Resceta login: a Supabase Auth user plus the pharmacy_staff row.
//
// The bootstrap. Staff are normally added from /staff inside the app, but that
// screen needs someone signed in as an owner or manager — so the FIRST account
// at a pharmacy has to come from here. After that, use the app.
//
// Usage (note the `--` so pnpm passes the args through):
//   pnpm --filter resceta staff:create -- <pharmacySlug> <owner|manager|pharmacist|cashier> <email> <password> [name]
//
// Example:
//   pnpm --filter resceta staff:create -- alpha-botica owner ana@botica.test 'StrongPass123!' 'Ana Reyes'
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

for (const f of [".env", ".env.local"]) {
  try {
    process.loadEnvFile(f);
  } catch {
    /* ignore */
  }
}

const ROLES = ["owner", "manager", "pharmacist", "cashier"];

const [slug, role, email, password, ...nameParts] = process.argv.slice(2);
const displayName = nameParts.join(" ").trim() || null;

if (!slug || !role || !email || !password) {
  console.error(
    "Usage: pnpm --filter resceta staff:create -- <pharmacySlug> <" +
      ROLES.join("|") +
      "> <email> <password> [name]",
  );
  process.exit(1);
}
if (!ROLES.includes(role)) {
  console.error(`Role must be one of: ${ROLES.join(", ")}`);
  process.exit(1);
}
if (password.length < 8) {
  console.error("Password must be at least 8 characters.");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(
    "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (.env.local).",
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const prisma = new PrismaClient();

/** Trusted context: this runs before any membership exists to scope to. */
function asSuper(fn) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select set_config('app.is_super_admin', 'on', true)`;
    return fn(tx);
  });
}

/**
 * Auth user first, membership second — never the other way round. The reverse
 * leaves a membership pointing at an authUserId that does not exist if the
 * second step fails: a row that looks fine in the staff list and can never be
 * signed into.
 */
async function findOrCreateAuthUser(mail, pass) {
  const created = await supabase.auth.admin.createUser({
    email: mail,
    password: pass,
    email_confirm: true,
  });
  if (created.data?.user) return { id: created.data.user.id, existing: false };

  const msg = created.error?.message ?? "";
  if (!/already been registered|already exists/i.test(msg)) {
    throw new Error(`Supabase could not create that user: ${msg}`);
  }
  // Already registered — the same person can be staff at two pharmacies, and
  // that is one login with two memberships.
  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) throw new Error(`Could not look up the existing user: ${error.message}`);
  const found = data.users.find((u) => u.email?.toLowerCase() === mail.toLowerCase());
  if (!found) throw new Error(`${mail} is registered but could not be found.`);
  return { id: found.id, existing: true };
}

try {
  const pharmacy = await asSuper((tx) =>
    tx.pharmacy.findUnique({
      where: { slug },
      select: { id: true, name: true, partnerId: true },
    }),
  );
  if (!pharmacy) {
    console.error(
      `No pharmacy with slug "${slug}". A pharmacy is created by a partner ` +
        "through the CANVEXIA portal, which dispatches to this product's adapter.",
    );
    process.exit(1);
  }
  if (!pharmacy.partnerId) {
    // Not fatal, but it means the pharmacy is invisible to every partner under
    // RLS and absent from every statement. Worth knowing before staffing it.
    console.warn(`⚠  ${pharmacy.name} has no partnerId — no partner owns it.`);
  }

  const mail = email.trim().toLowerCase();
  const already = await asSuper((tx) =>
    tx.pharmacyStaff.findFirst({
      where: { pharmacyId: pharmacy.id, email: mail },
      select: { id: true, role: true },
    }),
  );
  if (already) {
    console.error(`${mail} is already ${already.role} at ${pharmacy.name}.`);
    process.exit(1);
  }

  const user = await findOrCreateAuthUser(mail, password);

  const staff = await asSuper((tx) =>
    tx.pharmacyStaff.create({
      data: {
        pharmacyId: pharmacy.id,
        authUserId: user.id,
        email: mail,
        role,
        displayName,
      },
      select: { id: true },
    }),
  );

  console.log(`✅ ${mail} is now ${role} at ${pharmacy.name}.`);
  if (user.existing) {
    console.log("   (Existing Supabase login reused — their password is unchanged.)");
  }
  console.log(`   staff id: ${staff.id}`);
} catch (err) {
  console.error(`❌ ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
