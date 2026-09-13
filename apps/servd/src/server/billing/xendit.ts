import "server-only";
import { timingSafeEqual } from "node:crypto";
import type {
  BillingProvider,
  BillingWebhookEvent,
  ChargeResult,
  InvoiceCheckout,
} from "./provider";
import { SUB_ACCOUNT_MECHANISM_CONFIRMED, type SubAccountBinding } from "./subaccount";

/**
 * Xendit billing provider on the PLATFORM account (restaurants pay Servd for
 * their subscription).
 *
 * Recurring model: each due cycle creates a hosted Xendit Invoice; the
 * subscriber pays it and Xendit calls our webhook, which activates the
 * subscription. (Off-session card charging would need Xendit's recurring /
 * payment-methods API; until then the cron simply re-issues an invoice.)
 */
const API = "https://api.xendit.co";

export class XenditBillingProvider implements BillingProvider {
  /**
   * @param subAccount When set, this provider acts for a partner's sub-account
   *   under CANVEXIA's platform credential (D5, Option B). Absent means the call
   *   is CANVEXIA's own.
   */
  constructor(
    private readonly secretKey: string,
    private readonly callbackToken: string,
    private readonly subAccount?: SubAccountBinding,
  ) {}

  private auth(): string {
    // Xendit uses HTTP Basic with the secret key as username, blank password.
    return "Basic " + Buffer.from(`${this.secretKey}:`).toString("base64");
  }

  /**
   * Headers for one request, including the sub-account binding when acting for
   * a partner.
   *
   * Refuses outright while the binding mechanism is unconfirmed. With N
   * partners' revenue moving through a single platform credential, a call whose
   * sub-account header is wrong does not fail — it succeeds, into the wrong
   * account. A thrown error at the boundary is recoverable; money landing in
   * another partner's balance is not. See ./subaccount.ts.
   */
  private headers(extra: Record<string, string> = {}): Record<string, string> {
    if (this.subAccount && !SUB_ACCOUNT_MECHANISM_CONFIRMED) {
      throw new Error(
        `Refusing a gateway call for sub-account ${this.subAccount.subAccountId}: the ` +
          `platform sub-account mechanism is unconfirmed. See ` +
          `src/server/billing/subaccount.ts and docs/canvexia/xendit-questions.md §1.`,
      );
    }
    return { Authorization: this.auth(), ...(this.subAccount?.headers ?? {}), ...extra };
  }

  async createInvoiceCheckout(p: {
    amount: number; // centavos
    description: string;
    referenceNumber: string;
    successUrl: string;
  }): Promise<InvoiceCheckout> {
    const res = await fetch(`${API}/v2/invoices`, {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        // external_id ties the Xendit invoice back to our reference.
        external_id: p.referenceNumber,
        amount: Math.round(p.amount / 100), // Xendit PHP amounts are in pesos
        currency: "PHP",
        description: p.description,
        success_redirect_url: p.successUrl,
      }),
    });
    if (!res.ok) throw new Error(`Xendit invoice ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { id: string; invoice_url: string };
    return { gatewayRef: json.id, checkoutUrl: json.invoice_url };
  }

  /** Look up an invoice directly — the fallback when a webhook never lands. */
  async getCheckoutStatus(gatewayRef: string): Promise<"paid" | "pending" | "failed"> {
    const res = await fetch(`${API}/v2/invoices/${encodeURIComponent(gatewayRef)}`, {
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`Xendit invoice lookup ${res.status}`);
    const json = (await res.json()) as { status?: string };
    const status = (json.status ?? "").toUpperCase();
    if (status === "PAID" || status === "SETTLED") return "paid";
    if (status === "EXPIRED") return "failed";
    return "pending";
  }

  async chargeSavedCard(): Promise<ChargeResult> {
    // Not supported via the Invoice flow — the cron falls back to re-issuing an
    // invoice the subscriber pays. Returning "pending" keeps the cron safe.
    return { status: "pending" };
  }

  verifyAndParseWebhook(rawBody: string, callbackToken: string): BillingWebhookEvent | null {
    // Xendit authenticates webhooks with the x-callback-token header.
    const a = Buffer.from(callbackToken);
    const b = Buffer.from(this.callbackToken);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    try {
      const evt = JSON.parse(rawBody) as { id?: string; external_id?: string; status?: string };
      const status = (evt.status ?? "").toUpperCase();
      if (status !== "PAID" && status !== "SETTLED") {
        return { providerRef: evt.id ?? "", status: "failed", raw: evt };
      }
      return { providerRef: evt.id ?? "", status: "paid", raw: evt };
    } catch {
      return null;
    }
  }
}
