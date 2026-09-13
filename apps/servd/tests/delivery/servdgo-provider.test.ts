import { describe, expect, it, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import { ServdGoDeliveryProvider } from "@/server/delivery/servdgo";
import type { Contact, GeoPoint, OrderDetails } from "@/server/delivery/provider";

/**
 * The adapter's job is translation, so these tests are about the boundary:
 * pesos become centavos, ServdGo's statuses become ours, and a callback is
 * only believed when its signature and its age both hold up.
 *
 * fetch is stubbed rather than hitting the network — what matters is the
 * request we build and the reply we read, both of which are ours to get right.
 */

const BASE = "https://ref.supabase.co/functions/v1";
const KEY = "sgo_test_key";
const SECRET = "whsec_test_secret";

const provider = () => new ServdGoDeliveryProvider(BASE, { apiKey: KEY, webhookSecret: SECRET });

const pickup: GeoPoint = { name: "Lutong Bahay", address: "123 Colon St", lat: 10.3157, lng: 123.8854 };
const dropoff: GeoPoint = { name: "Maria", address: "9 Mango Ave", lat: 10.32, lng: 123.888 };
const order: OrderDetails = { orderId: "o1", ref: "SERVD-1001", total: 45000, itemCount: 2, note: "Ring the bell" };
const contact: Contact = { name: "Maria Santos", phone: "09175556666" };

/** One canned reply, and the request that earned it. */
function stubFetch(status: number, body: unknown) {
  const spy = vi.fn(async (_url: string, _init?: RequestInit) =>
    new Response(JSON.stringify(body), {
      status, headers: { "content-type": "application/json" },
    }));
  vi.stubGlobal("fetch", spy);
  return spy;
}

afterEach(() => vi.unstubAllGlobals());

describe("quoting", () => {
  it("sends only the drop-off, and returns centavos", async () => {
    const spy = stubFetch(200, { serviceable: true, deliveryFee: 50, convenienceFee: 5, total: 55 });
    const quote = await provider().getQuote(pickup, dropoff, order);

    expect(quote).toEqual({ fee: 5500, etaMinutes: null, currency: "PHP" });
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe(`${BASE}/merchant-quote`);
    // The pickup is the restaurant's own pin on ServdGo's side; sending ours
    // would be ignored at best and misleading at worst.
    expect(JSON.parse(String(init!.body))).toEqual({ dropoff: { lat: 10.32, lng: 123.888 } });
    expect((init!.headers as Record<string, string>)["X-API-Key"]).toBe(KEY);
  });

  it("treats an unserviceable address as no quote, not an error", async () => {
    stubFetch(200, { serviceable: false, reason: "We are closed until 9am" });
    await expect(provider().getQuote(pickup, dropoff, order)).resolves.toBeNull();
  });

  it("does not call out at all without a key", async () => {
    const spy = stubFetch(200, {});
    const bare = new ServdGoDeliveryProvider(BASE, {});
    await expect(bare.getQuote(pickup, dropoff, order)).resolves.toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("booking", () => {
  it("keys the booking by our own reference", async () => {
    const spy = stubFetch(201, {
      orderId: "uuid-1", reference: "SERVD-1001", status: "pending",
      trackingToken: "tok123", total: 55, duplicate: false,
    });
    const result = await provider().bookRider(pickup, dropoff, order, contact);

    expect(result.bookingRef).toBe("SERVD-1001");
    expect(result.status).toBe("searching");
    expect(result.fee).toBe(5500);
    expect(result.trackingUrl).toBe(`${BASE}/track?t=tok123`);

    const body = JSON.parse(String(spy.mock.calls[0]![1]!.body));
    expect(body.reference).toBe("SERVD-1001");
    expect(body.dropoff).toEqual({ lat: 10.32, lng: 123.888, address: "9 Mango Ave" });
    expect(body.recipient).toEqual({ name: "Maria Santos", contact: "09175556666" });
  });

  it("keeps the human-readable reason from a refusal", async () => {
    stubFetch(422, { error: "unprocessable", message: "That address is outside our area." });
    const result = await provider().bookRider(pickup, dropoff, order, contact);
    expect(result.status).toBe("failed");
    expect(result.raw).toBe("That address is outside our area.");
  });

  it("refuses to book without a drop-off pin", async () => {
    const spy = stubFetch(201, {});
    const noPin = { ...dropoff, lat: null, lng: null };
    const result = await provider().bookRider(pickup, noPin, order, contact);
    expect(result.status).toBe("failed");
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("status", () => {
  it("maps ServdGo's statuses onto ours", async () => {
    const cases: [string, string][] = [
      ["pending", "searching"],
      ["accepted", "assigned"],
      ["preparing", "assigned"],
      ["picked_up", "picked_up"],
      ["on_the_way", "picked_up"],
      ["delivered", "delivered"],
      ["cancelled", "cancelled"],
    ];
    for (const [theirs, ours] of cases) {
      stubFetch(200, { reference: "SERVD-1001", status: theirs });
      const res = await provider().getStatus("SERVD-1001");
      expect(res.status, `${theirs} → ${ours}`).toBe(ours);
    }
  });

  it("carries the rider through once there is one", async () => {
    stubFetch(200, {
      reference: "SERVD-1001", status: "on_the_way", total: 55,
      rider: { name: "Ben Cruz", contact: "09170000003" },
    });
    const res = await provider().getStatus("SERVD-1001");
    expect(res.riderName).toBe("Ben Cruz");
    expect(res.riderPhone).toBe("09170000003");
    expect(res.fee).toBe(5500);
  });
});

describe("cancelling", () => {
  it("reports the order cancelled", async () => {
    stubFetch(200, { reference: "SERVD-1001", status: "cancelled" });
    await expect(provider().cancelBooking("SERVD-1001")).resolves.toMatchObject({ status: "cancelled" });
  });

  it("tells the truth when ServdGo refuses because a rider has it", async () => {
    // The refusal, then the status call the adapter makes to find out where
    // things actually stand.
    const spy = vi.fn()
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ error: "unprocessable", message: "The rider already has this order." }),
        { status: 422 }))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ reference: "SERVD-1001", status: "on_the_way", rider: { name: "Ben Cruz" } }),
        { status: 200 }));
    vi.stubGlobal("fetch", spy);

    const res = await provider().cancelBooking("SERVD-1001");
    // Not "cancelled" — that would be a lie the kitchen acts on.
    expect(res.status).toBe("picked_up");
    expect(res.raw).toBe("The rider already has this order.");
  });

  it("does not claim success when ServdGo is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));
    const res = await provider().cancelBooking("SERVD-1001");
    expect(res.status).not.toBe("cancelled");
  });
});

describe("webhook verification", () => {
  const sign = (body: string, t: number, secret = SECRET) =>
    `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;

  const payload = JSON.stringify({
    event: "order.picked_up", reference: "SERVD-1001", status: "picked_up",
    trackingToken: "tok123", rider: { name: "Ben Cruz", contact: "09170000003" },
  });

  const headersWith = (sig: string) => new Headers({ "x-servdgo-signature": sig });

  it("accepts a fresh, correctly signed callback", () => {
    const t = Math.floor(Date.now() / 1000);
    const update = provider().verifyWebhook!(payload, headersWith(sign(payload, t)));
    expect(update).toMatchObject({
      bookingRef: "SERVD-1001", status: "picked_up", riderName: "Ben Cruz",
      trackingUrl: `${BASE}/track?t=tok123`,
    });
  });

  it("rejects a wrong signature", () => {
    const t = Math.floor(Date.now() / 1000);
    expect(provider().verifyWebhook!(payload, headersWith(sign(payload, t, "whsec_wrong")))).toBeNull();
  });

  it("rejects a body that was tampered with after signing", () => {
    const t = Math.floor(Date.now() / 1000);
    const sig = sign(payload, t);
    const edited = payload.replace("picked_up", "delivered");
    expect(provider().verifyWebhook!(edited, headersWith(sig))).toBeNull();
  });

  it("rejects a replay from an hour ago, however well signed", () => {
    const old = Math.floor(Date.now() / 1000) - 3600;
    expect(provider().verifyWebhook!(payload, headersWith(sign(payload, old)))).toBeNull();
  });

  it("carries the arrival through, because it is not a status", () => {
    const body = JSON.stringify({
      event: "order.arrived", reference: "SERVD-1001", status: "on_the_way",
      arrivedAt: "2026-08-20T09:15:00.000Z", trackingToken: "tok123",
    });
    const t = Math.floor(Date.now() / 1000);
    const update = provider().verifyWebhook!(body, headersWith(sign(body, t)));
    // Still out for delivery: nobody has taken the food yet.
    expect(update).toMatchObject({
      event: "order.arrived",
      status: "picked_up",
      arrivedAt: "2026-08-20T09:15:00.000Z",
    });
  });

  it("carries a message, and who said it", () => {
    const body = JSON.stringify({
      event: "order.message", reference: "SERVD-1001", status: "on_the_way",
      message: { from: "rider", body: "I am at the blue gate.", at: "2026-08-20T09:16:00.000Z" },
    });
    const t = Math.floor(Date.now() / 1000);
    const update = provider().verifyWebhook!(body, headersWith(sign(body, t)));
    expect(update?.message).toEqual({
      from: "rider", body: "I am at the blue gate.", at: "2026-08-20T09:16:00.000Z",
    });
  });

  it("gives a photo with no words something to say", () => {
    const body = JSON.stringify({
      event: "order.message", reference: "SERVD-1001", status: "on_the_way",
      message: { from: "rider", body: "   ", imageUrl: "https://example.test/p.jpg", at: null },
    });
    const t = Math.floor(Date.now() / 1000);
    const update = provider().verifyWebhook!(body, headersWith(sign(body, t)));
    expect(update?.message?.body).toBe("Sent a photo");
  });

  it("has no arrival and no message on an ordinary status callback", () => {
    const t = Math.floor(Date.now() / 1000);
    const update = provider().verifyWebhook!(payload, headersWith(sign(payload, t)));
    expect(update?.arrivedAt).toBeNull();
    expect(update?.message).toBeNull();
  });

  it("rejects a missing or malformed header", () => {
    expect(provider().verifyWebhook!(payload, new Headers())).toBeNull();
    expect(provider().verifyWebhook!(payload, headersWith("nonsense"))).toBeNull();
  });

  it("verifies nothing when no secret is configured", () => {
    const t = Math.floor(Date.now() / 1000);
    const bare = new ServdGoDeliveryProvider(BASE, { apiKey: KEY });
    expect(bare.verifyWebhook!(payload, headersWith(sign(payload, t)))).toBeNull();
  });
});
