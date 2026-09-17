import "server-only";
import { systemDb } from "@/server/tenancy/scoped-db";
import { partnerStatementEmail } from "@servd/core";
import { partnerUrl } from "@/lib/urls";

/**
 * Email a partner what they owe CANVEXIA for the month.
 *
 * QUEUED, NOT SENT. `outbound_emails` already claims-before-sending, retries
 * and records its runs; a second sending path is a second place to get
 * idempotency wrong, and getting it wrong here means invoicing somebody twice
 * for the same month.
 *
 * Called only when `freezeStatement` reports it CREATED the row, so re-running
 * the month cannot re-invoice. Returns false rather than throwing: a statement
 * that froze correctly must not be reported as failed because an email queue
 * was unavailable.
 */
export async function queueStatementInvoice(partnerId: string, month: string): Promise<boolean> {
  try {
    const [statement, partner] = await systemDb(async (tx) => [
      await tx.partnerStatement.findUnique({
        where: { partnerId_month: { partnerId, month } },
        select: { hqCentavos: true, merchantCount: true, dueAt: true },
      }),
      await tx.partner.findUnique({
        where: { id: partnerId },
        select: { name: true, email: true },
      }),
    ]);

    if (!statement || !partner?.email) return false;
    // Nothing owed is not an invoice. A partner who signed nobody last month
    // should not get a bill for zero pesos with a deadline on it.
    if (statement.hqCentavos <= 0) return false;

    const copy = partnerStatementEmail({
      partnerName: partner.name,
      month,
      amountCentavos: statement.hqCentavos,
      merchantCount: statement.merchantCount,
      dueAt: statement.dueAt ?? new Date(),
      statementUrl: `${partnerUrl()}/partner/commissions`,
    });

    await systemDb((tx) =>
      tx.outboundEmail.create({
        data: {
          template: "partner.statement",
          toEmail: partner.email,
          toName: partner.name,
          partnerId,
          /**
           * `subject` + `body`, which is the outbox's GENERAL path — the one
           * the notifier and the digest already use — rather than a fourth
           * named template with its own renderer. The copy is composed here,
           * today, and stored: re-deriving it weeks later would send whatever
           * that release thinks the figures were.
           *
           * No token and no credential in here, per the outbox's own rule:
           * just the numbers the partner can already see in their portal.
           */
          payload: {
            subject: copy.subject,
            body: copy.paragraphs.join("\n\n"),
            month,
            amountCentavos: statement.hqCentavos,
          },
        },
        select: { id: true },
      }),
    );
    return true;
  } catch {
    return false;
  }
}
