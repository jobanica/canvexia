"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { newEventId, uploadReceipt, type ReceiptFormState } from "@servd/core/agent-kit";
import { enqueueProductEvent } from "@servd/db";
import { requireAdminAction } from "@/server/tenancy/require-admin";
import { systemDb, tenantDb } from "@/server/tenancy/scoped-db";
import { rateLimit } from "@/server/build/rate-limit";
import { canSubmitActivation, parseReceiptForm } from "@/lib/billing/manual";
import { portalConfig, productSlug } from "./config";
import { flushOutboxQuietly } from "./outbox";

/**
 * The owner uploads proof of a QR/bank payment.
 *
 * The restaurant is the signed-in owner's, from the session — never from the
 * form. The image goes to the agent portal's private storage first (so a
 * receipt that cannot be stored is reported now, while the owner is still on
 * the page); then the local record and `payment.submitted` are written in one
 * transaction, and the outbox delivers the event.
 *
 * Nothing here grants access. Only the portal's payment.confirmed callback does.
 */
export async function submitReceiptAction(_prev: ReceiptFormState, fd: FormData): Promise<ReceiptFormState> {
  let restaurantId: string;
  try {
    ({ restaurantId } = await requireAdminAction());
  } catch {
    return { status: "error", message: "Only the owner can submit payments. Sign in again." };
  }
  const limited = await rateLimit("billing:receipt");
  if (!limited.ok) return { status: "error", message: limited.error ?? "Please try again later." };

  const config = portalConfig();
  if (!config) return { status: "error", message: "Payments are not open yet. Please contact support." };

  const fields: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string") fields[k] = v;
  const parsed = parseReceiptForm(fields);
  if (!parsed.ok) return { status: "error", message: parsed.error };
  const input = parsed.input;

  const file = fd.get("receipt");
  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", message: "Attach a photo or screenshot of your receipt." };
  }

  const state = await tenantDb(restaurantId, async (tx) => ({
    restaurant: await tx.restaurant.findFirst({ select: { billingMode: true } }),
    payments: await tx.servdManualPayment.findMany({ select: { type: true, status: true } }),
    clash: await tx.servdManualPayment.findFirst({ where: { bankReference: input.bankReference }, select: { id: true } }),
  }));
  if (state.restaurant?.billingMode !== "manual") {
    return { status: "error", message: "This account is billed through the payment gateway, not by receipt." };
  }
  if (input.type === "activation" && !canSubmitActivation(state.payments)) {
    return { status: "error", message: "Your activation payment has already been sent." };
  }
  if (state.clash) return { status: "error", message: "That bank reference number has already been used." };

  const upload = await uploadReceipt(config, new Uint8Array(await file.arrayBuffer()), file.type);
  if (!upload.ok) return { status: "error", message: upload.error };

  const eventId = newEventId();
  try {
    await systemDb(async (tx) => {
      await tx.servdManualPayment.create({
        data: {
          restaurantId,
          type: input.type,
          monthsCovered: input.monthsCovered,
          billingMonthStart: input.billingMonth ? new Date(`${input.billingMonth}-01T00:00:00Z`) : null,
          amount: input.amount,
          bankReference: input.bankReference,
          receiptPath: upload.receiptPath,
          eventId,
        },
        select: { id: true },
      });
      await enqueueProductEvent(tx, productSlug(), {
        event_id: eventId,
        type: "payment.submitted",
        occurred_at: new Date().toISOString(),
        data: {
          external_customer_id: restaurantId,
          type: input.type,
          months_covered: input.monthsCovered,
          billing_month_start: input.billingMonth,
          amount: input.amount,
          bank_reference: input.bankReference,
          receipt_path: upload.receiptPath,
        },
      });
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { status: "error", message: "That bank reference number has already been used." };
    }
    console.error("[billing] receipt submit failed:", e);
    return { status: "error", message: "Your receipt could not be saved. Please try again." };
  }

  await flushOutboxQuietly();
  revalidatePath("/admin/billing");
  return {
    status: "done",
    message: "Receipt sent. We'll confirm it shortly — usually within one business day.",
  };
}
