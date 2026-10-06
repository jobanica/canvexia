import "server-only";
import { randomUUID } from "node:crypto";
import { systemDb, staffDb, type Tx } from "@/server/scoped-db";
import { writeAudit, SYSTEM_ACTOR } from "@/server/audit";
import { staffActor, type SignedInStaff } from "@/server/auth";
import { loadSettings } from "@/server/settings";
import { putPrivateObject } from "@/server/storage";
import { queueCallback, flushCallbacksQuietly } from "@/server/callbacks";
import { contractPdf } from "@/server/contract-pdf";
import {
  contractLinkSecret,
  createSigningToken,
  minimumTermEnd,
  renderTemplate,
  signatureBytes,
  verifySigningToken,
  type ContractVars,
} from "@/lib/contract";
import { peso } from "@/lib/money";
import { manilaDate, manilaDateTime } from "@/lib/time";
import { sniffImageType } from "@/lib/image-type";

/** The active customer template for a product: its own, else the global one. */
async function activeTemplate(tx: Tx, productId: string) {
  return (
    (await tx.agentContractTemplate.findFirst({ where: { kind: "customer", productId, active: true } })) ??
    (await tx.agentContractTemplate.findFirst({ where: { kind: "customer", productId: null, active: true } }))
  );
}

export function signingUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3002").replace(/\/$/, "");
  return `${base}/sign/${token}`;
}

/** A signing link for a customer the caller has already been allowed to see. */
export function linkFor(referralId: string, now = new Date()) {
  const { token, expiresAt } = createSigningToken(referralId, contractLinkSecret(), now);
  return { url: signingUrl(token), expiresAt };
}

export type SigningView =
  | { state: "invalid" }
  | { state: "expired" }
  | { state: "no_template" }
  | { state: "signed"; businessName: string; signedAt: Date }
  | { state: "ready"; title: string; body: string; businessName: string; templateVersion: number };

/** What the public signing page shows for a token. */
export async function signingView(token: string, now = new Date()): Promise<SigningView> {
  const v = verifySigningToken(token, contractLinkSecret(), now);
  if (!v.ok) return { state: v.reason === "expired" ? "expired" : "invalid" };
  return systemDb(async (tx) => {
    const r = await tx.agentReferral.findUnique({
      where: { id: v.referralId },
      include: { product: true, rule: true, contracts: { take: 1, orderBy: { signedAt: "desc" } } },
    });
    if (!r) return { state: "invalid" };
    if (r.contracts[0]) return { state: "signed", businessName: r.businessName, signedAt: r.contracts[0].signedAt };
    const t = await activeTemplate(tx, r.productId);
    if (!t) return { state: "no_template" };
    const settings = await loadSettings(tx);
    return {
      state: "ready",
      title: `${r.product.name} subscription agreement`,
      body: renderTemplate(t.body, varsFor(r, settings.contract_minimum_months, now)),
      businessName: r.businessName,
      templateVersion: t.version,
    };
  });
}

function varsFor(
  r: { businessName: string; ownerName: string; plan: string | null; product: { name: string }; rule: { activationFee: number; monthlyFee: number } | null },
  minimumMonths: number,
  now: Date,
): ContractVars {
  return {
    business_name: r.businessName,
    owner_name: r.ownerName,
    product_name: r.product.name,
    plan: r.plan ?? "Standard",
    activation_fee: r.rule ? peso(r.rule.activationFee) : "(to be confirmed)",
    monthly_fee: r.rule ? peso(r.rule.monthlyFee) : "(to be confirmed)",
    minimum_term_months: String(minimumMonths),
    date: manilaDate(now),
  };
}

export interface SignInput {
  signerName: string;
  signerPosition: string;
  signerPhone: string;
  signatureDataUrl: string;
  agreed: boolean;
  ip: string | null;
  userAgent: string | null;
}

/**
 * Sign. The text signed is rendered again here, server-side, from the same
 * template version and values — not taken from the browser — so the PDF says
 * exactly what the portal showed.
 */
export async function signContract(token: string, input: SignInput, now = new Date()): Promise<{ ok: true } | { ok: false; error: string }> {
  const v = verifySigningToken(token, contractLinkSecret(), now);
  if (!v.ok) return { ok: false, error: v.reason === "expired" ? "This link has expired. Ask for a new one." : "This link is not valid." };
  if (!input.agreed) return { ok: false, error: "Tick the box to agree." };
  const name = input.signerName.trim();
  const position = input.signerPosition.trim();
  const phone = input.signerPhone.trim();
  if (name.length < 2 || position.length < 2 || phone.replace(/\D/g, "").length < 7) {
    return { ok: false, error: "Enter your name, position and phone number." };
  }
  const png = signatureBytes(input.signatureDataUrl);
  if (!png || sniffImageType(png) !== "image/png") return { ok: false, error: "Draw your signature in the box." };

  // Prepare outside the transaction (PDF and uploads are slow), then commit
  // with a re-check under a row lock so two submits cannot both sign.
  const prepared = await systemDb(async (tx) => {
    const r = await tx.agentReferral.findUnique({ where: { id: v.referralId }, include: { product: true, rule: true } });
    if (!r) return null;
    const t = await activeTemplate(tx, r.productId);
    const settings = await loadSettings(tx);
    return { r, t, settings };
  });
  if (!prepared) return { ok: false, error: "This link is not valid." };
  const { r, t, settings } = prepared;
  if (!t) return { ok: false, error: "The agreement is not available yet. Please try again later." };

  const contractId = randomUUID();
  const body = renderTemplate(t.body, varsFor(r, settings.contract_minimum_months, now));
  const pdf = await contractPdf({
    title: `${r.product.name} subscription agreement`,
    body,
    signerName: name,
    signerPosition: position,
    signerPhone: phone,
    signedAtLabel: `${manilaDateTime(now)} (Asia/Manila)`,
    ip: input.ip,
    userAgent: input.userAgent,
    signaturePng: png,
    templateVersion: t.version,
  });
  const base = `contracts/${r.product.slug}/${r.id}/${contractId}`;
  await putPrivateObject(`${base}-signature.png`, png, "image/png");
  await putPrivateObject(`${base}.pdf`, pdf, "application/pdf");

  const minimumTermEndsAt = minimumTermEnd(now, settings.contract_minimum_months);
  const result = await systemDb(async (tx) => {
    await tx.$queryRaw`select id from agent_referrals where id = ${r.id} for update`;
    if ((await tx.agentContract.count({ where: { referralId: r.id } })) > 0) return "already" as const;
    await tx.agentContract.create({
      data: {
        id: contractId,
        referralId: r.id,
        templateId: t.id,
        templateVersion: t.version,
        signerName: name,
        signerPosition: position,
        signerPhone: phone,
        signaturePath: `${base}-signature.png`,
        signedAt: now,
        ip: input.ip,
        userAgent: input.userAgent?.slice(0, 500) ?? null,
        minimumTermEndsAt,
        pdfPath: `${base}.pdf`,
      },
    });
    await queueCallback(tx, r.productId, "contract.signed", {
      external_customer_id: r.externalCustomerId,
      contract_id: contractId,
      signed_at: now.toISOString(),
      minimum_term_ends_at: minimumTermEndsAt.toISOString(),
    });
    await writeAudit(tx, SYSTEM_ACTOR, {
      action: "contract.sign",
      entity: "agent_contract",
      entityId: contractId,
      after: { referralId: r.id, templateVersion: t.version, signerName: name, ip: input.ip },
    });
    return "signed" as const;
  });
  if (result === "already") return { ok: false, error: "This agreement has already been signed." };
  await flushCallbacksQuietly();
  return { ok: true };
}

/** Publish a new customer template version (per product, or global). */
export async function publishTemplate(staff: SignedInStaff, productId: string | null, body: string) {
  const text = body.trim();
  if (text.length < 50) return { ok: false as const, error: "The agreement text is too short." };
  return staffDb("admin", async (tx) => {
    const latest = await tx.agentContractTemplate.findFirst({
      where: { kind: "customer", productId },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const version = (latest?.version ?? 0) + 1;
    await tx.agentContractTemplate.updateMany({ where: { kind: "customer", productId, active: true }, data: { active: false } });
    const t = await tx.agentContractTemplate.create({ data: { kind: "customer", productId, version, body: text, active: true } });
    await writeAudit(tx, staffActor(staff), {
      action: "contract_template.publish",
      entity: "agent_contract_template",
      entityId: t.id,
      after: { productId, version },
    });
    return { ok: true as const, version };
  });
}
