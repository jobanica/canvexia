import "server-only";
import { randomUUID } from "node:crypto";
import { systemDb } from "@/server/tenancy/scoped-db";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * WHAT THIS PHARMACY PAYS, WHEN IT RUNS OUT, AND HOW TO RENEW.
 *
 * Resceta had no billing at all. `subscriptions` and `restaurant_invoices` were
 * written when a merchant was a restaurant and nothing else, so a pharmacy had
 * no plan, no expiry, no renewal and no invoice — and `recordSettlement` read
 * `tx.restaurant`, which meant a pharmacy could never produce a ledger entry.
 * A partner selling Resceta earned nothing this platform recorded and
 * CANVEXIA's 30% never accrued on a peso of it.
 *
 * Both tables now carry `productId` and this reads them with `"pharmacy"`. The
 * renewal itself is the SAME flow Servd uses — `merchant_renewals` has carried
 * `productId` since it was written — so a partner confirms a pharmacy renewal
 * on the same screen, with the same claim-first transaction, and the split is
 * booked by the same ledger writer.
 *
 * PRODUCT ID IS IN EVERY WHERE CLAUSE. `restaurantId` on these tables means
 * "the merchant id within productId" and the two id spaces are separate;
 * matching on the id alone would be correct only by the accident of uuids not
 * colliding, which is not a thing to rely on in a money table.
 */

const PRODUCT = "pharmacy";

export interface PharmacyBilling {
  planName: string;
  priceMonthly: number;
  status: string;
  /** The date they are paid up to. Null on a ₱0 plan, which never runs out. */
  paidUntil: Date | null;
  daysLeft: number | null;
  /** Who collects — their partner, with whatever payment details they set. */
  partner: {
    name: string;
    payQrUrl: string | null;
    payInstructions: string | null;
  } | null;
  renewal: {
    id: string;
    status: string;
    amountCentavos: number;
  } | null;
  /** Why the last one was turned down, so a rejection can be fixed. */
  rejectedNote: string | null;
  invoices: {
    id: string;
    invoiceNo: string | null;
    amount: number;
    status: string;
    createdAt: Date;
  }[];
}

export async function pharmacyBilling(pharmacyId: string): Promise<PharmacyBilling | null> {
  const sub = await systemDb((tx) =>
    tx.subscription.findFirst({
      where: { restaurantId: pharmacyId, productId: PRODUCT },
      orderBy: { createdAt: "desc" },
      select: {
        status: true,
        currentPeriodEnd: true,
        plan: { select: { name: true, priceMonthly: true } },
      },
    }),
  ).catch(() => null);
  if (!sub) return null;

  const [owner, invoices, open, lastDecided] = await Promise.all([
    systemDb((tx) =>
      tx.pharmacy.findUnique({ where: { id: pharmacyId }, select: { partnerId: true } }),
    ).catch(() => null),
    systemDb((tx) =>
      tx.restaurantInvoice.findMany({
        where: { restaurantId: pharmacyId, productId: PRODUCT },
        orderBy: { createdAt: "desc" },
        take: 12,
        select: { id: true, invoiceNo: true, amount: true, status: true, createdAt: true },
      }),
    ).catch(() => []),
    systemDb((tx) =>
      tx.merchantRenewal.findFirst({
        where: {
          merchantId: pharmacyId,
          productId: PRODUCT,
          status: { in: ["requested", "receipt_uploaded"] },
        },
        orderBy: { requestedAt: "desc" },
        select: { id: true, status: true, amountCentavos: true },
      }),
    ).catch(() => null),
    systemDb((tx) =>
      tx.merchantRenewal.findFirst({
        where: { merchantId: pharmacyId, productId: PRODUCT, status: { in: ["confirmed", "rejected"] } },
        orderBy: { decidedAt: "desc" },
        select: { status: true, note: true },
      }),
    ).catch(() => null),
  ]);

  const partnerRow = owner?.partnerId
    ? await systemDb((tx) =>
        tx.partner.findUnique({
          where: { id: owner.partnerId! },
          select: { name: true, payQrPath: true, payInstructions: true },
        }),
      ).catch(() => null)
    : null;

  const paidUntil = (sub.plan.priceMonthly ?? 0) > 0 ? (sub.currentPeriodEnd ?? null) : null;

  return {
    planName: sub.plan.name,
    priceMonthly: sub.plan.priceMonthly,
    status: sub.status,
    paidUntil,
    daysLeft: paidUntil
      ? Math.max(0, Math.ceil((paidUntil.getTime() - Date.now()) / 86_400_000))
      : null,
    partner: partnerRow
      ? {
          name: partnerRow.name,
          payQrUrl: await signBillingFile(partnerRow.payQrPath),
          payInstructions: partnerRow.payInstructions,
        }
      : null,
    renewal: open,
    rejectedNote: lastDecided?.status === "rejected" ? lastDecided.note : null,
    invoices,
  };
}

/**
 * Start a renewal.
 *
 * A NO-OP when one is already open, not an error. A unique partial index
 * enforces one open renewal per merchant — two confirmed separately would
 * extend the pharmacy two months for one payment — and from the owner's side
 * "a renewal is in progress" is true either way.
 */
export async function startPharmacyRenewal(
  pharmacyId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [pharmacy, sub] = await Promise.all([
    systemDb((tx) =>
      tx.pharmacy.findUnique({ where: { id: pharmacyId }, select: { partnerId: true } }),
    ).catch(() => null),
    systemDb((tx) =>
      tx.subscription.findFirst({
        where: { restaurantId: pharmacyId, productId: PRODUCT },
        orderBy: { createdAt: "desc" },
        select: { plan: { select: { priceMonthly: true } } },
      }),
    ).catch(() => null),
  ]);
  if (!pharmacy?.partnerId) return { ok: false, error: "This account has nobody to renew with." };

  try {
    await systemDb((tx) =>
      tx.merchantRenewal.create({
        data: {
          partnerId: pharmacy.partnerId!,
          productId: PRODUCT,
          merchantId: pharmacyId,
          // The list price. The partner corrects it to what they actually
          // collected when they confirm, and the 30% is a share of that.
          amountCentavos: sub?.plan.priceMonthly ?? 0,
        },
        select: { id: true },
      }),
    );
  } catch {
    // Almost certainly the one-open-renewal index. A race is a success.
    return { ok: true };
  }
  return { ok: true };
}

/** Attach the proof of payment to the open renewal. */
export async function attachPharmacyReceipt(
  pharmacyId: string,
  file: File,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const renewal = await systemDb((tx) =>
    tx.merchantRenewal.findFirst({
      where: {
        merchantId: pharmacyId,
        productId: PRODUCT,
        status: { in: ["requested", "receipt_uploaded"] },
      },
      orderBy: { requestedAt: "desc" },
      select: { id: true, partnerId: true },
    }),
  ).catch(() => null);
  if (!renewal) return { ok: false, error: "Start a renewal first." };

  let path: string;
  try {
    path = await putReceipt(renewal.partnerId, pharmacyId, file);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "That didn't upload." };
  }

  await systemDb((tx) =>
    tx.merchantRenewal.updateMany({
      // State in the WHERE clause: a renewal already decided must not accept a
      // late receipt and look like it is waiting again.
      where: { id: renewal.id, status: { in: ["requested", "receipt_uploaded"] } },
      data: { receiptPath: path, status: "receipt_uploaded", receiptAt: new Date() },
    }),
  );
  return { ok: true };
}

/* -------------------------------------------------------------- storage ---- */

/**
 * The same private bucket and the same path shape the partner portal reads.
 *
 * Both pictures are private and read back through a short signed URL. A
 * partner's payment QR moves money to that operator; a merchant's receipt is a
 * screenshot of somebody's e-wallet with their name and often their balance on
 * it. Neither belongs in a public bucket, and the portal's reviewer has to be
 * able to find this file — so the path is the portal's, not a new one.
 */
const BUCKET = "partner-billing";
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MAX_BYTES = 5 * 1024 * 1024;

async function putReceipt(partnerId: string, merchantId: string, file: File): Promise<string> {
  const ext = EXT[file.type];
  if (!ext) throw new Error("Use a JPEG, PNG or WebP image.");
  if (file.size > MAX_BYTES) throw new Error("That image is too large — keep it under 5 MB.");

  const supabase = createSupabaseAdminClient();
  const full = `receipts/${partnerId}/${merchantId}/${randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(full, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type,
      upsert: false,
    });
  if (error) throw new Error(error.message);
  return full;
}

/**
 * Ten minutes: long enough to read a payment code off a phone, short enough
 * that a copied link is not a lasting leak. Null rather than throwing — a
 * missing QR must not take down the billing page.
 */
async function signBillingFile(path: string | null): Promise<string | null> {
  if (!path) return null;
  try {
    const supabase = createSupabaseAdminClient();
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600);
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}
