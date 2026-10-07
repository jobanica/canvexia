import "server-only";
import { staffDb, systemDb } from "@/server/scoped-db";
import { decryptSecret, encryptSecret, newApiSecret } from "@/server/crypto";
import { writeAudit } from "@/server/audit";
import { staffActor, type SignedInStaff } from "@/server/auth";

/**
 * Products are rows. Adding one is this form plus the connection kit in the
 * product — nothing in the portal's code names a product.
 */

export interface ProductInput {
  slug: string;
  name: string;
  signupUrl: string | null;
  callbackUrl: string | null;
}

export function validateProductInput(raw: Record<string, string | undefined>):
  | { ok: true; input: ProductInput }
  | { ok: false; error: string } {
  const slug = (raw.slug ?? "").trim().toLowerCase();
  const name = (raw.name ?? "").trim();
  if (!/^[a-z][a-z0-9-]{1,39}$/.test(slug)) {
    return { ok: false, error: "Slug: lowercase letters, digits and dashes, 2–40 characters." };
  }
  if (name.length < 2 || name.length > 80) return { ok: false, error: "Name is required." };
  const url = (v: string | undefined, label: string) => {
    const s = (v ?? "").trim();
    if (!s) return { ok: true as const, value: null };
    try {
      const u = new URL(s);
      // Callbacks carry signed payment outcomes; never over plain http, except
      // to a developer's own machine.
      const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
      if (u.protocol !== "https:" && !(local && u.protocol === "http:")) {
        return { ok: false as const, error: `${label} must be https.` };
      }
      return { ok: true as const, value: u.toString() };
    } catch {
      return { ok: false as const, error: `${label} is not a valid URL.` };
    }
  };
  const signup = url(raw.signupUrl, "Signup URL");
  if (!signup.ok) return signup;
  const callback = url(raw.callbackUrl, "Callback URL");
  if (!callback.ok) return callback;
  return { ok: true, input: { slug, name, signupUrl: signup.value, callbackUrl: callback.value } };
}

function hint(secret: string): string {
  return secret.slice(-4);
}

/** Create a product. Returns the API secret — the only time it is ever shown. */
export async function createProduct(staff: SignedInStaff, input: ProductInput) {
  const secret = newApiSecret();
  const product = await staffDb("admin", async (tx) => {
    const p = await tx.agentProduct.create({
      data: {
        ...input,
        credential: { create: { secretEnc: encryptSecret(secret), secretHint: hint(secret) } },
      },
    });
    await writeAudit(tx, staffActor(staff), {
      action: "product.create",
      entity: "agent_product",
      entityId: p.id,
      after: input,
    });
    return p;
  });
  return { product, secret };
}

export async function updateProduct(
  staff: SignedInStaff,
  productId: string,
  input: Omit<ProductInput, "slug"> & { status: "active" | "inactive" },
) {
  return staffDb("admin", async (tx) => {
    const before = await tx.agentProduct.findUniqueOrThrow({ where: { id: productId } });
    const after = await tx.agentProduct.update({ where: { id: productId }, data: input });
    await writeAudit(tx, staffActor(staff), {
      action: "product.update",
      entity: "agent_product",
      entityId: productId,
      before: {
        name: before.name,
        signupUrl: before.signupUrl,
        callbackUrl: before.callbackUrl,
        status: before.status,
      },
      after: input,
    });
    return after;
  });
}

/**
 * Replace a product's secret. The old one stops working immediately — there
 * is no overlap window, so the product must be redeployed with the new one
 * straight away. The audit row records that it happened and the new hint,
 * never the secret.
 */
export async function rotateProductSecret(staff: SignedInStaff, productId: string) {
  const secret = newApiSecret();
  await staffDb("admin", async (tx) => {
    await tx.agentProductCredential.upsert({
      where: { productId },
      create: { productId, secretEnc: encryptSecret(secret), secretHint: hint(secret) },
      update: { secretEnc: encryptSecret(secret), secretHint: hint(secret), rotatedAt: new Date() },
    });
    await writeAudit(tx, staffActor(staff), {
      action: "product.rotate_secret",
      entity: "agent_product",
      entityId: productId,
      after: { secretHint: hint(secret) },
    });
  });
  return secret;
}

/**
 * The product and its plaintext secret, for verifying a signed request. Null
 * for an unknown or inactive product — the caller answers both the same way,
 * so the API does not tell a stranger which slugs exist.
 */
export async function productForApi(
  slug: string,
): Promise<{ id: string; slug: string; secret: string } | null> {
  if (!/^[a-z][a-z0-9-]{1,39}$/.test(slug)) return null;
  const row = await systemDb((tx) =>
    tx.agentProduct.findUnique({
      where: { slug },
      select: { id: true, slug: true, status: true, credential: { select: { secretEnc: true } } },
    }),
  );
  if (!row || row.status !== "active" || !row.credential) return null;
  return { id: row.id, slug: row.slug, secret: decryptSecret(row.credential.secretEnc) };
}
