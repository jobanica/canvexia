import "server-only";
import { systemDb } from "@/server/tenancy/scoped-db";
import { merchantInvoiceEmail, parseBrandConfig } from "@servd/core";
import { platformUrl } from "@/lib/urls";

/**
 * Send the merchant their invoice, from their partner.
 *
 * QUEUED. `outbound_emails` already claims before it sends, retries and records
 * its runs; a second sending path is a second place to get idempotency wrong,
 * and getting it wrong here means telling somebody twice that they paid.
 *
 * THE LINK IS ON THE PLATFORM HOST, not the partner one. `/admin` is the
 * merchant product, and `partnerUrl()` would send a restaurant owner to the
 * portal their operator logs into — where the middleware prefixes `/partner`
 * onto the path and they get a 404 wearing the wrong brand.
 *
 * Returns quietly on any failure: the payment is already confirmed, the invoice
 * already exists and is visible in their billing screen. Losing the email must
 * not undo any of that.
 */
export async function queueMerchantInvoice(renewalId: string, invoiceId: string): Promise<boolean> {
  try {
    const invoice = await systemDb((tx) =>
      tx.restaurantInvoice.findUnique({
        where: { id: invoiceId },
        select: {
          invoiceNo: true,
          amount: true,
          periodEnd: true,
          restaurantId: true,
          issuedByPartnerId: true,
          restaurant: { select: { name: true } },
        },
      }),
    );
    if (!invoice?.issuedByPartnerId) return false;

    // The owner's login is a synthetic address at a domain that receives no
    // mail, so the only address worth writing to is one they gave us.
    const to = await systemDb((tx) =>
      tx.staffUser.findFirst({
        where: { restaurantId: invoice.restaurantId, role: "admin" },
        orderBy: { createdAt: "asc" },
        select: { email: true, username: true },
      }),
    );
    const address = to?.email ?? "";
    if (!address || /@staff\./i.test(address)) return false;

    const partner = await systemDb((tx) =>
      tx.partner.findUnique({
        where: { id: invoice.issuedByPartnerId! },
        select: { name: true, brandConfig: true },
      }),
    );
    const brand = parseBrandConfig(partner?.brandConfig);

    const copy = merchantInvoiceEmail({
      issuerName: brand.displayName || brand.legalName || partner?.name || "Your partner",
      merchantName: invoice.restaurant.name,
      invoiceNo: invoice.invoiceNo ?? invoiceId.slice(0, 8),
      amountCentavos: invoice.amount,
      paidUntil: invoice.periodEnd,
      invoiceUrl: `${platformUrl()}/admin/invoices/${invoiceId}`,
    });

    await systemDb((tx) =>
      tx.outboundEmail.create({
        data: {
          template: "merchant.invoice",
          toEmail: address,
          toName: invoice.restaurant.name,
          partnerId: invoice.issuedByPartnerId,
          payload: {
            subject: copy.subject,
            body: copy.paragraphs.join("\n\n"),
            renewalId,
            invoiceId,
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
