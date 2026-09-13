/**
 * BILLING PROVIDER ABSTRACTION (restaurant → platform subscriptions)
 *
 * Unlike diner payments (connected-accounts, each restaurant's own keys), the
 * subscription charge goes to YOU — so this uses the PLATFORM's PayMongo
 * account. Business logic talks to this interface only, so the provider stays
 * swappable.
 */

export interface InvoiceCheckout {
  gatewayRef: string; // checkout/payment-intent id we store on the invoice
  checkoutUrl: string; // hosted page where the owner pays + saves a card
}

export interface ChargeResult {
  status: "paid" | "failed" | "pending";
  providerRef?: string;
  error?: string;
}

export interface BillingWebhookEvent {
  providerRef: string; // the checkout/intent id this event concerns
  status: "paid" | "failed" | "refunded";
  paymentMethodId?: string; // captured so future months charge off-session
  customerId?: string;
  raw?: unknown;
}

export interface BillingProvider {
  /** Hosted checkout for the first/overdue invoice; also captures the card. */
  createInvoiceCheckout(p: {
    amount: number; // centavos
    description: string;
    referenceNumber: string;
    successUrl: string;
  }): Promise<InvoiceCheckout>;

  /** Off-session recurring charge using a previously saved card. */
  chargeSavedCard(p: {
    amount: number;
    description: string;
    paymentMethodId: string;
    customerId?: string;
  }): Promise<ChargeResult>;

  /** Verify + parse a platform billing webhook (signature-verified). */
  verifyAndParseWebhook(rawBody: string, signature: string): BillingWebhookEvent | null;

  /**
   * Ask the gateway what a checkout's status actually is. Lets the app settle a
   * payment when the webhook never arrived (misconfigured endpoint, downtime),
   * instead of leaving a paying customer stuck. Optional: providers that can't
   * look one up simply omit it.
   */
  getCheckoutStatus?(gatewayRef: string): Promise<"paid" | "pending" | "failed">;
}
