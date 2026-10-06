// Creates an agent-portal staff login: a Supabase Auth user plus a
// portal_staff row, as admin or verifier.
//
// The bootstrap. There is no screen for adding staff yet, and the first admin
// could not use one anyway — so portal staff come from here.
//
// Usage (note the `--` so pnpm passes the args through):
//   pnpm --filter agent-portal staff:create -- <admin|verifier> <email> <password>
//
// If the email already has a Supabase login (a Servd owner, say), that login is
// reused and its password is left alone.
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

for (const f of [".env", ".env.local"]) {
  try {
    process.loadEnvFile(f);
  } catch {
    /* ignore */
  }
}

const ROLES = ["admin", "verifier"];
const [role, email, password] = process.argv.slice(2);

if (!ROLES.includes(role) || !email || !password) {
  console.error("Usage: pnpm --filter agent-portal staff:create -- <admin|verifier> <email> <password>");
  process.exit(1);
}
if (password.length < 8) {
  console.error("Password must be at least 8 characters.");
  process.exit(1);
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

function asSuper(fn) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select set_config('app.is_super_admin', 'on', true)`;
    return fn(tx);
  });
}

/** Auth user first, staff row second, so a failure never leaves a row nobody can sign in to. */
async function findOrCreateAuthUser(mail, pass) {
  const created = await supabase.auth.admin.createUser({ email: mail, password: pass, email_confirm: true });
  if (created.data?.user) return { id: created.data.user.id, existing: false };
  const msg = created.error?.message ?? "";
  if (!/already been registered|already exists/i.test(msg)) {
    throw new Error(`Supabase could not create that user: ${msg}`);
  }
  // listUsers pages at 50 by default; walk the pages rather than assume page 1.
  for (let page = 1; page < 200; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`Could not look up the existing user: ${error.message}`);
    const found = data.users.find((u) => u.email?.toLowerCase() === mail);
    if (found) return { id: found.id, existing: true };
    if (data.users.length < 200) break;
  }
  throw new Error(`${mail} is registered but could not be found.`);
}

try {
  const mail = email.trim().toLowerCase();
  const user = await findOrCreateAuthUser(mail, password);
  const staff = await asSuper((tx) =>
    tx.portalStaff.upsert({
      where: { authUserId: user.id },
      create: { authUserId: user.id, email: mail, role },
      update: { role, active: true },
      select: { id: true },
    }),
  );
  console.log(`✅ ${mail} is now ${role} in the agent portal.`);
  if (user.existing) console.log("   (Existing Supabase login reused — password unchanged.)");
  console.log(`   staff id: ${staff.id}`);
} catch (err) {
  console.error(`❌ ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
