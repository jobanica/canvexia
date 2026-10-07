"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import {
  canSubmitActivation,
  newEventId,
  parseReceiptForm,
  uploadReceipt,
  type ReceiptFormState,
} from "@servd/core/agent-kit";
import { enqueueProductEvent } from "@servd/db";
import { requireStaff } from "@/server/tenancy/current-user";
import { pharmacyDb, systemDb } from "@/server/tenancy/scoped-db";
import { portalConfig, productSlug } from "./config";
import { flushOutboxQuietly } from "./outbox";

/**
 * The owner uploads proof of payment. Same flow as Servd's: the image goes to
 * the portal first, then the local record and payment.submitted commit
 * together. The pharmacy is the session's, never the form's.
 */
export async function submitReceiptAction(_prev: ReceiptFormState, fd: FormData): Promise<ReceiptFormState> {
  let pharmacyId: string;
  try {
    ({ pharmacyId } = await requireStaff("manageSettings"));
  } catch {
    return { status: "error", message: "Only the owner can submit payments." };
  }
  const config = portalConfig();
  if (!config) return { status: "error", message: "Payments are not open yet. Please contact support." };

  const fields: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string") fields[k] = v;
  const parsed = parseReceiptForm(fields);
  if (!parsed.ok) return { status: "error", message: parsed.error };
  const input = parsed.input;
  const file = fd.get("receipt");
  if (!(file instanceof File) || file.size === 0) return { status: "error", message: "Attach a photo of your receipt." };

  const state = await pharmacyDb(pharmacyId, async (tx) => ({
    pharmacy: await tx.pharmacy.findFirst({ select: { contractSignedAt: true } }),
    payments: await tx.rescetaManualPayment.findMany({ select: { type: true, status: true } }),
  }));
  if (input.type === "activation" && !state.pharmacy?.contractSignedAt) {
    return { status: "error", message: "Sign the subscription agreement before paying the activation." };
  }
  if (input.type === "activation" && !canSubmitActivation(state.payments)) {
    return { status: "error", message: "Your activation payment has already been sent." };
  }

  const upload = await uploadReceipt(config, new Uint8Array(await file.arrayBuffer()), file.type);
  if (!upload.ok) return { status: "error", message: upload.error };

  const eventId = newEventId();
  try {
    await systemDb(async (tx) => {
      await tx.rescetaManualPayment.create({
        data: {
          pharmacyId,
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
          external_customer_id: pharmacyId,
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
  revalidatePath("/billing");
  return { status: "done", message: "Receipt sent. We'll confirm it shortly — usually within one business day." };
}
