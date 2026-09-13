import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  ApiCredentials,
  Contact,
  DeliveryProvider,
  DeliveryMessage,
  DeliveryQuote,
  GeoPoint,
  OrderDetails,
  RiderStatus,
  StatusResult,
  BookingResult,
  WebhookUpdate,
} from "@/server/delivery/provider";

/**
 * ServdGo — the Davao delivery network, as a DeliveryProvider.
 *
 * Fills in what ApiDeliveryProvider left as TODOs. Kept as its own class rather
 * than edited into that template so the template stays available for the next
 * provider, and so nothing here is mistaken for generic REST behaviour.
 *
 * Two things about ServdGo shape the adapter:
 *
 *   1. Pickup is not sent. A ServdGo API key belongs to one restaurant, and
 *      that restaurant's pin is stored on their side — it is what routes the
 *      job to a city's riders. Sending a pickup would be ignored at best.
 *   2. Money is pesos, two decimals. Servd counts centavos, so every amount is
 *      converted at the boundary and nowhere else.
 *
 * The base URL is the functions root, with no trailing slash:
 *   https://<project-ref>.supabase.co/functions/v1
 */
export class ServdGoDeliveryProvider implements DeliveryProvider {
  readonly key = "servdgo";

  constructor(
    private readonly baseUrl: string,
    private readonly creds: ApiCredentials,
  ) {}

  private get auth(): Record<string, string> {
    // ServdGo accepts either header; X-API-Key is the documented one.
    return {
      "X-API-Key": this.creds.apiKey ?? "",
      "Content-Type": "application/json",
    };
  }

  private url(path: string): string {
    return `${this.baseUrl.replace(/\/+$/, "")}/${path}`;
  }

  /** Pesos → centavos, without floating-point drift on the way. */
  private static toCentavos(pesos: number | string | null | undefined): number | null {
    if (pesos == null) return null;
    const n = typeof pesos === "string" ? Number(pesos) : pesos;
    return Number.isFinite(n) ? Math.round(n * 100) : null;
  }

  /** ServdGo's order_status enum → Servd's RiderStatus. */
  private static mapStatus(status: string): RiderStatus {
    switch (status) {
      case "pending":
        return "searching"; // in the pool, no rider yet
      case "accepted":
      case "preparing":
        return "assigned";
      case "picked_up":
      case "on_the_way":
        return "picked_up";
      case "delivered":
        return "delivered";
      case "cancelled":
        return "cancelled";
      default:
        return "searching";
    }
  }

  /**
   * A quote, from the drop-off alone.
   *
   * `serviceable: false` is a real answer, not an error — the city is closed,
   * or the address is outside the service area — and its `reason` is written by
   * the operator for a human to read. Returning null lets the caller fall back
   * to manual, which is the correct behaviour for "we cannot take this".
   */
  async getQuote(_pickup: GeoPoint, dropoff: GeoPoint, _order: OrderDetails): Promise<DeliveryQuote | null> {
    if (!this.baseUrl || !this.creds.apiKey) return null;
    if (dropoff.lat == null || dropoff.lng == null) return null;
    try {
      const res = await fetch(this.url("merchant-quote"), {
        method: "POST",
        headers: this.auth,
        body: JSON.stringify({ dropoff: { lat: dropoff.lat, lng: dropoff.lng } }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        serviceable?: boolean;
        reason?: string | null;
        total?: number;
        deliveryFee?: number;
      };
      if (!data.serviceable) return null;
      const fee = ServdGoDeliveryProvider.toCentavos(data.total ?? data.deliveryFee);
      if (fee == null) return null;
      // ServdGo does not promise an ETA before a rider accepts, and inventing
      // one here would put a number on screen that nothing stands behind.
      return { fee, etaMinutes: null, currency: "PHP" };
    } catch {
      return null;
    }
  }

  /**
   * Book it.
   *
   * `order.ref` is the idempotency key on ServdGo's side: booking the same
   * reference twice returns the first order rather than putting a second rider
   * on the road, so a retry after a timeout is safe and expected.
   */
  async bookRider(
    _pickup: GeoPoint,
    dropoff: GeoPoint,
    order: OrderDetails,
    contact: Contact,
  ): Promise<BookingResult> {
    if (!this.baseUrl || !this.creds.apiKey) {
      return { bookingRef: null, status: "failed", raw: "ServdGo not fully configured" };
    }
    if (dropoff.lat == null || dropoff.lng == null || !dropoff.address) {
      return { bookingRef: null, status: "failed", raw: "Drop-off needs a pin and an address" };
    }
    try {
      const res = await fetch(this.url("merchant-book"), {
        method: "POST",
        headers: this.auth,
        body: JSON.stringify({
          reference: order.ref,
          dropoff: { lat: dropoff.lat, lng: dropoff.lng, address: dropoff.address },
          recipient: { name: contact.name, contact: contact.phone },
          notes: order.note ?? undefined,
          items: order.itemCount ? `${order.itemCount} item(s)` : undefined,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        orderId?: string;
        reference?: string;
        status?: string;
        trackingToken?: string;
        total?: number;
        error?: string;
        message?: string;
      };

      if (!res.ok) {
        // 422 carries a message written for a person — an unserviceable
        // address, a closed city — so keep it rather than an HTTP number.
        return {
          bookingRef: null,
          status: "failed",
          raw: data.message ?? data.error ?? `HTTP ${res.status}`,
        };
      }

      return {
        // The reference is what every later call is keyed by, not the uuid.
        bookingRef: data.reference ?? order.ref,
        status: data.status ? ServdGoDeliveryProvider.mapStatus(data.status) : "searching",
        fee: ServdGoDeliveryProvider.toCentavos(data.total),
        etaMinutes: null,
        trackingUrl: data.trackingToken ? this.trackingUrl(data.trackingToken) : null,
        raw: data,
      };
    } catch (e) {
      return { bookingRef: null, status: "failed", raw: e instanceof Error ? e.message : "error" };
    }
  }

  /** The diner-facing page. One URL, no login, safe to text to anybody. */
  private trackingUrl(token: string): string {
    return `${this.url("track")}?t=${encodeURIComponent(token)}`;
  }

  async getStatus(bookingRef: string): Promise<StatusResult> {
    try {
      const res = await fetch(
        `${this.url("merchant-order")}?reference=${encodeURIComponent(bookingRef)}`,
        { headers: this.auth },
      );
      if (!res.ok) return { status: "searching" };
      return this.fromOrderBody(await res.json());
    } catch {
      return { status: "searching" };
    }
  }

  /**
   * Call it off.
   *
   * ServdGo refuses once a rider has collected — they are carrying somebody's
   * food and are owed the trip — so this reports the truth rather than the
   * best-effort "cancelled" the template returned. Staff ring the rider on the
   * number the status response already carries.
   */
  async cancelBooking(bookingRef: string): Promise<StatusResult> {
    try {
      const res = await fetch(this.url("merchant-cancel"), {
        method: "POST",
        headers: this.auth,
        body: JSON.stringify({ reference: bookingRef }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Refused: the order is still live. Say what it actually is.
        const current = await this.getStatus(bookingRef);
        return { ...current, raw: (data as { message?: string }).message ?? current.raw };
      }
      return this.fromOrderBody(data);
    } catch {
      return { status: "searching", raw: "ServdGo unreachable; the order was not cancelled" };
    }
  }

  /** One order body, one shape — the same JSON book, status and cancel return. */
  private fromOrderBody(body: unknown): StatusResult {
    const data = (body ?? {}) as {
      status?: string;
      total?: number;
      trackingToken?: string;
      rider?: { name?: string; contact?: string } | null;
    };
    return {
      status: data.status ? ServdGoDeliveryProvider.mapStatus(data.status) : "searching",
      riderName: data.rider?.name ?? null,
      riderPhone: data.rider?.contact ?? null,
      // ServdGo does not stream the rider's position to partners; the tracking
      // page does that, and it is the diner's to open.
      riderLat: null,
      riderLng: null,
      trackingUrl: data.trackingToken ? this.trackingUrl(data.trackingToken) : null,
      etaMinutes: null,
      fee: ServdGoDeliveryProvider.toCentavos(data.total),
      raw: data,
    };
  }

  /**
   * Verify an inbound callback.
   *
   *   X-ServdGo-Signature: t=<unix seconds>,v1=<hex>
   *   v1 = HMAC-SHA256(secret, `${t}.${rawBody}`)
   *
   * The timestamp is inside the signed string, which is what makes a captured
   * callback useless later — so it is checked, not just parsed. Five minutes,
   * the window ServdGo's own documentation asks for.
   */
  verifyWebhook(rawBody: string, headers: Headers): WebhookUpdate | null {
    const secret = this.creds.webhookSecret;
    if (!secret) return null;

    const header = headers.get("x-servdgo-signature") ?? "";
    const parts = Object.fromEntries(
      header.split(",").map((p) => {
        const i = p.indexOf("=");
        return i === -1 ? [p.trim(), ""] : [p.slice(0, i).trim(), p.slice(i + 1).trim()];
      }),
    ) as { t?: string; v1?: string };
    if (!parts.t || !parts.v1) return null;

    const age = Math.abs(Date.now() / 1000 - Number(parts.t));
    if (!Number.isFinite(age) || age > 300) return null;

    const expected = createHmac("sha256", secret).update(`${parts.t}.${rawBody}`).digest("hex");
    try {
      const a = Buffer.from(expected);
      const b = Buffer.from(parts.v1);
      if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    } catch {
      return null;
    }

    // The body is the order view itself with an `event` added — the same flat
    // shape merchant-order returns, which is why one parser serves both.
    try {
      const data = JSON.parse(rawBody) as {
        event?: string;
        reference?: string;
        status?: string;
        arrivedAt?: string | null;
        rider?: { position?: { lat?: number; lng?: number } | null } | null;
        message?: { from?: string; body?: string | null; imageUrl?: string | null; at?: string | null } | null;
      };
      if (!data.reference || !data.status) return null;
      const parsed = this.fromOrderBody(data);

      // A photo with no words still has to say something out loud.
      const message: DeliveryMessage | null = data.message
        ? {
            from: data.message.from === "customer" ? "customer" : "rider",
            body: data.message.body?.trim() || (data.message.imageUrl ? "Sent a photo" : null),
            at: data.message.at ?? null,
          }
        : null;

      const pos = data.rider?.position ?? null;
      return {
        bookingRef: data.reference,
        status: parsed.status,
        event: data.event ?? null,
        arrivedAt: data.arrivedAt ?? null,
        message,
        riderName: parsed.riderName,
        riderPhone: parsed.riderPhone,
        riderLat: typeof pos?.lat === "number" ? pos.lat : null,
        riderLng: typeof pos?.lng === "number" ? pos.lng : null,
        trackingUrl: parsed.trackingUrl,
        etaMinutes: null,
        raw: data,
      };
    } catch {
      return null;
    }
  }
}
