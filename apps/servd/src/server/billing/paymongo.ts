import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  BillingProvider,
  BillingWebhookEvent,
  ChargeResult,
  InvoiceCheckout,
} from "./provider";

/**
 * PayMongo billing provider on the PLATFORM account (restaurants pay Servd).
 *
 * Recurring model: the first/overdue invoice is paid via a hosted Checkout
 * Session (which also saves the card); subsequent months charge that saved card
 * off-session via PaymentIntents. The cron drives the schedule.
 *
 * NOTE: off-session card charging can require prior 3DS setup depending on the
 * card/issuer and your PayMongo capabilities — verify against your live account.
 */
const API = "https://api.paymongo.com/v1";

export class PayMongoBillingProvider implements BillingProvider {
  constructor(
    private readonly secretKey: string,
    private readonly webhookSecret: string,
  ) {}

  private auth(): string {
    return "Basic " + Buffer.from(`${this.secretKey}:`).toString("base64");
  }

  async createInvoiceCheckout(p: {
    amount: number;
    description: string;
    referenceNumber: string;
    successUrl: string;
  }): Promise<InvoiceCheckout> {
    const res = await fetch(`${API}/checkout_sessions`, {
      method: "POST",
      headers: { Authorization: this.auth(), "Content-Type": "application/json" },
      body: JSON.stringify({
        data: {
          attributes: {
            line_items: [
              { name: p.description, amount: p.amount, quantity: 1, currency: "PHP" },
            ],
            payment_method_types: ["card"],
            reference_number: p.referenceNumber,
            success_url: p.successUrl,
            send_email_receipt: true,
            show_line_items: true,
          },
        },
      }),
    });
    if (!res.ok) throw new Error(`PayMongo billing checkout ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as {
      data: { id: string; attributes: { checkout_url: string } };
    };
    return { gatewayRef: json.data.id, checkoutUrl: json.data.attributes.checkout_url };
  }

  async chargeSavedCard(p: {
    amount: number;
    description: string;
    paymentMethodId: string;
    customerId?: string;
  }): Promise<ChargeResult> {
    try {
      // Create a PaymentIntent and attach the saved method, off-session.
      const create = await fetch(`${API}/payment_intents`, {
        method: "POST",
        headers: { Authorization: this.auth(), "Content-Type": "application/json" },
        body: JSON.stringify({
          data: {
            attributes: {
              amount: p.amount,
              currency: "PHP",
              description: p.description,
              payment_method_allowed: ["card"],
              capture_type: "automatic",
            },
          },
        }),
      });
      if (!create.ok) return { status: "failed", error: `intent ${create.status}` };
      const intent = (await create.json()) as { data: { id: string } };

      const attach = await fetch(`${API}/payment_intents/${intent.data.id}/attach`, {
        method: "POST",
        headers: { Authorization: this.auth(), "Content-Type": "application/json" },
        body: JSON.stringify({
          data: { attributes: { payment_method: p.paymentMethodId } },
        }),
      });
      if (!attach.ok) return { status: "failed", error: `attach ${attach.status}` };
      const result = (await attach.json()) as {
        data: { id: string; attributes: { status: string } };
      };
      const ok = result.data.attributes.status === "succeeded";
      return {
        status: ok ? "paid" : "pending",
        providerRef: result.data.id,
        error: ok ? undefined : `status ${result.data.attributes.status}`,
      };
    } catch (e) {
      return { status: "failed", error: e instanceof Error ? e.message : "charge failed" };
    }
  }

  verifyAndParseWebhook(rawBody: string, signature: string): BillingWebhookEvent | null {
    const parts = Object.fromEntries(
      signature.split(",").map((kv) => {
        const [k, v] = kv.split("=");
        return [k?.trim(), v?.trim()];
      }),
    ) as { t?: string; te?: string; li?: string };
    if (!parts.t || (!parts.te && !parts.li)) return null;

    const expected = createHmac("sha256", this.webhookSecret)
      .update(`${parts.t}.${rawBody}`)
      .digest("hex");
    const provided = parts.li || parts.te || "";
    const a = Buffer.from(expected);
    const b = Buffer.from(provided);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    let event: {
      data?: {
        attributes?: {
          type?: string;
          data?: { id?: string; attributes?: { payments?: unknown; payment_method?: { id?: string } } };
        };
      };
    };
    try {
      event = JSON.parse(rawBody);
    } catch {
      return null;
    }
    const type = event.data?.attributes?.type ?? "";
    const providerRef = event.data?.attributes?.data?.id ?? "";
    if (!providerRef) return null;

    const paymentMethodId = event.data?.attributes?.data?.attributes?.payment_method?.id;
    const status: BillingWebhookEvent["status"] = type.includes("refund")
      ? "refunded"
      : type.includes("paid") || type.includes("succeeded")
        ? "paid"
        : "failed";

    return { providerRef, status, paymentMethodId, raw: event };
  }
}
