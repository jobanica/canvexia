import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { systemDb } from "@/server/tenancy/scoped-db";
import { decryptJson } from "@/lib/crypto/secrets";
import { ServdGoDeliveryProvider } from "@/server/delivery/servdgo";

/**
 * Provider-agnostic third-party delivery. The rest of the app talks to the
 * `DeliveryProvider` interface only; each real provider (a Davao-local API,
 * Lalamove, …) is an adapter behind it, so we can swap providers via store
 * settings without rewiring booking actions, the webhook, or the UI.
 *
 * Three implementations ship:
 *   - ManualDeliveryProvider   — staff book by phone/app; status updated by hand.
 *   - DeepLinkDeliveryProvider — open the provider's app/site with details
 *                                pre-filled (no API / no auto-tracking).
 *   - ApiDeliveryProvider      — REST template (encrypted creds + webhook). The
 *                                provider-specific endpoints/field mapping are
 *                                clearly-marked TODOs to fill once API docs land.
 */

export type RiderStatus =
  | "searching" // looking for a rider
  | "assigned" // rider assigned, heading to pickup
  | "picked_up" // rider has the order
  | "delivered"
  | "cancelled"
  | "failed" // no rider found / provider error
  | "manual"; // tracked by staff (manual / deep-link)

export interface GeoPoint {
  name: string;
  address: string;
  phone?: string | null;
  lat?: number | null;
  lng?: number | null;
}

export interface OrderDetails {
  orderId: string;
  ref: string; // short human reference
  total: number; // centavos (server-authoritative)
  itemCount: number;
  note?: string | null;
}

export interface Contact {
  name: string;
  phone: string;
}

export interface DeliveryQuote {
  fee: number; // centavos
  etaMinutes: number | null;
  currency: "PHP";
}

export interface BookingResult {
  bookingRef: string | null; // provider id (null for manual)
  status: RiderStatus;
  fee?: number | null;
  etaMinutes?: number | null;
  trackingUrl?: string | null;
  riderName?: string | null;
  riderPhone?: string | null;
  raw?: unknown;
}

export interface StatusResult {
  status: RiderStatus;
  riderName?: string | null;
  riderPhone?: string | null;
  riderLat?: number | null;
  riderLng?: number | null;
  trackingUrl?: string | null;
  etaMinutes?: number | null;
  fee?: number | null;
  raw?: unknown;
}

/** The stable contract every provider implements. */
export interface DeliveryProvider {
  readonly key: string; // "manual" | "deeplink" | "api"
  /** Price + ETA before booking (null if the provider can't quote). */
  getQuote(pickup: GeoPoint, dropoff: GeoPoint, order: OrderDetails): Promise<DeliveryQuote | null>;
  /** Book a rider for an accepted delivery order. */
  bookRider(pickup: GeoPoint, dropoff: GeoPoint, order: OrderDetails, contact: Contact): Promise<BookingResult>;
  /** Current rider status for a booking. */
  getStatus(bookingRef: string): Promise<StatusResult>;
  /** Cancel a booking (best-effort). */
  cancelBooking(bookingRef: string): Promise<StatusResult>;
  /** Deep-link providers expose a URL for staff to finish in the provider app. */
  deepLinkUrl?(pickup: GeoPoint, dropoff: GeoPoint, order: OrderDetails): string | null;
  /** API providers verify their inbound webhook signature. */
  verifyWebhook?(rawBody: string, headers: Headers): WebhookUpdate | null;
}

/** Normalised webhook payload an API provider maps its event onto. */
/** One thing the rider said, on the way. */
export interface DeliveryMessage {
  from: "rider" | "customer";
  body: string | null;
  at: string | null;
}

export interface WebhookUpdate {
  bookingRef: string;
  status: RiderStatus;
  /** The provider's own name for what happened, when it gives one. */
  event?: string | null;
  /**
   * When the rider announced they were at the door.
   *
   * Deliberately separate from status: arriving is not a stage of the delivery,
   * it is a moment inside "out for delivery", and the delivery is not over
   * until somebody hands the food across.
   */
  arrivedAt?: string | null;
  /** Present on a message event, so the diner can be told somebody spoke. */
  message?: DeliveryMessage | null;
  riderName?: string | null;
  riderPhone?: string | null;
  riderLat?: number | null;
  riderLng?: number | null;
  trackingUrl?: string | null;
  etaMinutes?: number | null;
  raw?: unknown;
}

// ---------------------------------------------------------------- 1. Manual

/** Always-available safety net: staff arrange the rider; status is set by hand. */
export const ManualDeliveryProvider: DeliveryProvider = {
  key: "manual",
  async getQuote() {
    return null;
  },
  async bookRider() {
    return { bookingRef: null, status: "manual" };
  },
  async getStatus() {
    return { status: "manual" };
  },
  async cancelBooking() {
    return { status: "cancelled" };
  },
};

// -------------------------------------------------------------- 2. Deep link

/**
 * For providers without an API: build a pre-filled URL the staff open to finish
 * booking in the provider's own app/site. No auto-tracking — status stays manual.
 *
 * Template tokens (URL-encoded): {pickupAddress} {pickupLat} {pickupLng}
 * {pickupPhone} {dropoffAddress} {dropoffLat} {dropoffLng} {dropoffName}
 * {dropoffPhone} {ref} {note}. Example:
 *   https://app.example.com/book?from={pickupAddress}&to={dropoffAddress}&phone={dropoffPhone}
 */
export class DeepLinkDeliveryProvider implements DeliveryProvider {
  readonly key = "deeplink";
  constructor(private readonly template: string) {}

  private fill(pickup: GeoPoint, dropoff: GeoPoint, order: OrderDetails): string {
    const e = (v: unknown) => encodeURIComponent(String(v ?? ""));
    return this.template
      .replaceAll("{pickupAddress}", e(pickup.address))
      .replaceAll("{pickupLat}", e(pickup.lat))
      .replaceAll("{pickupLng}", e(pickup.lng))
      .replaceAll("{pickupPhone}", e(pickup.phone))
      .replaceAll("{dropoffAddress}", e(dropoff.address))
      .replaceAll("{dropoffLat}", e(dropoff.lat))
      .replaceAll("{dropoffLng}", e(dropoff.lng))
      .replaceAll("{dropoffName}", e(dropoff.name))
      .replaceAll("{dropoffPhone}", e(dropoff.phone))
      .replaceAll("{ref}", e(order.ref))
      .replaceAll("{note}", e(order.note));
  }

  deepLinkUrl(pickup: GeoPoint, dropoff: GeoPoint, order: OrderDetails): string | null {
    if (!this.template) return null;
    return this.fill(pickup, dropoff, order);
  }
  async getQuote(): Promise<DeliveryQuote | null> {
    return null;
  }
  async bookRider(pickup: GeoPoint, dropoff: GeoPoint, order: OrderDetails): Promise<BookingResult> {
    return { bookingRef: null, status: "manual", trackingUrl: this.deepLinkUrl(pickup, dropoff, order) };
  }
  async getStatus(): Promise<StatusResult> {
    return { status: "manual" };
  }
  async cancelBooking(): Promise<StatusResult> {
    return { status: "cancelled" };
  }
}

// ---------------------------------------------------------------- 3. API

export interface ApiCredentials {
  apiKey?: string;
  webhookSecret?: string;
}

/**
 * Template adapter for a REST delivery API. The shape (auth header, endpoints,
 * request/response fields, webhook signature) varies per provider, so every
 * provider-specific bit is a clearly-marked TODO to fill once you have the
 * Davao provider's docs. Until then booking returns "failed" so the UI falls
 * back to manual — nothing is silently broken.
 */
export class ApiDeliveryProvider implements DeliveryProvider {
  readonly key = "api";
  constructor(
    private readonly baseUrl: string,
    private readonly creds: ApiCredentials,
  ) {}

  private get auth(): Record<string, string> {
    // TODO(provider): set the real auth header/scheme from the provider's docs.
    return { Authorization: `Bearer ${this.creds.apiKey ?? ""}`, "Content-Type": "application/json" };
  }

  // TODO(provider): map the provider's status strings onto our RiderStatus.
  private mapStatus(_providerStatus: string): RiderStatus {
    const s = _providerStatus.toLowerCase();
    if (s.includes("assign")) return "assigned";
    if (s.includes("pick")) return "picked_up";
    if (s.includes("deliver") || s.includes("complete")) return "delivered";
    if (s.includes("cancel")) return "cancelled";
    if (s.includes("search") || s.includes("pending") || s.includes("find")) return "searching";
    if (s.includes("fail") || s.includes("reject")) return "failed";
    return "searching";
  }

  async getQuote(pickup: GeoPoint, dropoff: GeoPoint, _order: OrderDetails): Promise<DeliveryQuote | null> {
    if (!this.baseUrl) return null;
    try {
      // TODO(provider): real quote endpoint + request body + response fields.
      const res = await fetch(`${this.baseUrl}/quotations`, {
        method: "POST",
        headers: this.auth,
        body: JSON.stringify({ pickup, dropoff }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { fee?: number; eta?: number };
      return { fee: Math.round((data.fee ?? 0) * 100), etaMinutes: data.eta ?? null, currency: "PHP" };
    } catch {
      return null;
    }
  }

  async bookRider(pickup: GeoPoint, dropoff: GeoPoint, order: OrderDetails, contact: Contact): Promise<BookingResult> {
    if (!this.baseUrl || !this.creds.apiKey) {
      return { bookingRef: null, status: "failed", raw: "API provider not fully configured" };
    }
    try {
      // TODO(provider): real booking endpoint + request body + response fields.
      const res = await fetch(`${this.baseUrl}/orders`, {
        method: "POST",
        headers: this.auth,
        body: JSON.stringify({ pickup, dropoff, contact, reference: order.ref }),
      });
      if (!res.ok) return { bookingRef: null, status: "failed", raw: `HTTP ${res.status}` };
      const data = (await res.json()) as {
        id?: string;
        status?: string;
        price?: number;
        eta?: number;
        trackingUrl?: string;
      };
      return {
        bookingRef: data.id ?? null,
        status: data.status ? this.mapStatus(data.status) : "searching",
        fee: data.price != null ? Math.round(data.price * 100) : null,
        etaMinutes: data.eta ?? null,
        trackingUrl: data.trackingUrl ?? null,
        raw: data,
      };
    } catch (e) {
      return { bookingRef: null, status: "failed", raw: e instanceof Error ? e.message : "error" };
    }
  }

  async getStatus(bookingRef: string): Promise<StatusResult> {
    try {
      // TODO(provider): real status endpoint + response fields.
      const res = await fetch(`${this.baseUrl}/orders/${encodeURIComponent(bookingRef)}`, { headers: this.auth });
      if (!res.ok) return { status: "searching" };
      const data = (await res.json()) as {
        status?: string;
        driver?: { name?: string; phone?: string; lat?: number; lng?: number };
        trackingUrl?: string;
        eta?: number;
      };
      return {
        status: data.status ? this.mapStatus(data.status) : "searching",
        riderName: data.driver?.name ?? null,
        riderPhone: data.driver?.phone ?? null,
        riderLat: data.driver?.lat ?? null,
        riderLng: data.driver?.lng ?? null,
        trackingUrl: data.trackingUrl ?? null,
        etaMinutes: data.eta ?? null,
        raw: data,
      };
    } catch {
      return { status: "searching" };
    }
  }

  async cancelBooking(bookingRef: string): Promise<StatusResult> {
    try {
      // TODO(provider): real cancel endpoint.
      await fetch(`${this.baseUrl}/orders/${encodeURIComponent(bookingRef)}/cancel`, {
        method: "POST",
        headers: this.auth,
      });
    } catch {
      /* best-effort */
    }
    return { status: "cancelled" };
  }

  verifyWebhook(rawBody: string, headers: Headers): WebhookUpdate | null {
    const secret = this.creds.webhookSecret;
    if (!secret) return null;
    // TODO(provider): use the provider's real signature header + scheme.
    const provided = headers.get("x-delivery-signature") ?? "";
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    try {
      const a = Buffer.from(expected);
      const b = Buffer.from(provided);
      if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    } catch {
      return null;
    }
    try {
      // TODO(provider): map the provider's webhook event onto WebhookUpdate.
      const data = JSON.parse(rawBody) as {
        id?: string;
        bookingId?: string;
        status?: string;
        driver?: { name?: string; phone?: string; lat?: number; lng?: number };
        trackingUrl?: string;
        eta?: number;
      };
      const bookingRef = data.id ?? data.bookingId;
      if (!bookingRef || !data.status) return null;
      return {
        bookingRef,
        status: this.mapStatus(data.status),
        riderName: data.driver?.name ?? null,
        riderPhone: data.driver?.phone ?? null,
        riderLat: data.driver?.lat ?? null,
        riderLng: data.driver?.lng ?? null,
        trackingUrl: data.trackingUrl ?? null,
        etaMinutes: data.eta ?? null,
        raw: data,
      };
    } catch {
      return null;
    }
  }
}

// ------------------------------------------------------------- resolver

export interface ResolvedProvider {
  provider: DeliveryProvider;
  mode: "manual" | "deeplink" | "api";
  providerKey: string | null;
  enabled: boolean;
}

/**
 * Build the configured provider for a restaurant. Reads delivery_settings via
 * systemDb (so it works from the session-less webhook too) and decrypts API
 * credentials. Falls back to Manual when unconfigured / not migrated.
 */
export async function resolveProvider(restaurantId: string): Promise<ResolvedProvider> {
  let row: {
    provider: string;
    providerKey: string | null;
    deepLinkTemplate: string | null;
    apiBaseUrl: string | null;
    credentialsEnc: string | null;
    enabled: boolean;
  } | null = null;
  try {
    row = await systemDb((tx) =>
      tx.deliverySettings.findFirst({
        where: { restaurantId },
        select: {
          provider: true,
          providerKey: true,
          deepLinkTemplate: true,
          apiBaseUrl: true,
          credentialsEnc: true,
          enabled: true,
        },
      }),
    );
  } catch {
    /* delivery_settings not migrated yet → manual */
  }

  const manual: ResolvedProvider = { provider: ManualDeliveryProvider, mode: "manual", providerKey: null, enabled: true };
  if (!row) return manual;

  if (row.provider === "deeplink" && row.deepLinkTemplate) {
    return {
      provider: new DeepLinkDeliveryProvider(row.deepLinkTemplate),
      mode: "deeplink",
      providerKey: row.providerKey,
      enabled: row.enabled,
    };
  }
  if (row.provider === "api" && row.apiBaseUrl) {
    let creds: ApiCredentials = {};
    try {
      creds = row.credentialsEnc ? decryptJson<ApiCredentials>(row.credentialsEnc) : {};
    } catch {
      /* bad/old key → treat as unconfigured */
    }
    // A named provider gets its own adapter; anything else falls to the generic
    // REST template, whose endpoints and field mapping are still TODOs.
    const named = (row.providerKey ?? "").trim().toLowerCase();
    return {
      provider:
        named === "servdgo"
          ? new ServdGoDeliveryProvider(row.apiBaseUrl, creds)
          : new ApiDeliveryProvider(row.apiBaseUrl, creds),
      mode: "api",
      providerKey: row.providerKey,
      enabled: row.enabled,
    };
  }
  return manual;
}
