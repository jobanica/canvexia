import { describe, it, expect } from "vitest";
import {
  configFromEnv,
  deliverEvent,
  retryDelayMs,
  signedHeaders,
  uploadReceipt,
  verifyCallback,
  type AgentPortalConfig,
  type ProductEvent,
} from "@servd/core/agent-kit";
import { refFromSearchParams } from "@servd/core/agent-kit/ref";
import { sniffImageType } from "@/lib/image-type";

const config: AgentPortalConfig = { baseUrl: "https://agents.test", productSlug: "servd", secret: "s3cret" };
const event: ProductEvent = {
  event_id: "evt_000000001",
  type: "customer.cancelled",
  occurred_at: "2026-10-06T00:00:00.000Z",
  data: { external_customer_id: "r1", reason: null },
};
const respond = (status: number, json: unknown) =>
  (async () => new Response(JSON.stringify(json), { status })) as unknown as typeof fetch;

describe("configFromEnv", () => {
  it("is null until all three are set, and trims a trailing slash", () => {
    expect(configFromEnv({ AGENT_PORTAL_URL: "https://a.test/" })).toBeNull();
    expect(
      configFromEnv({ AGENT_PORTAL_URL: "https://a.test/", AGENT_PORTAL_PRODUCT_SLUG: "servd", AGENT_PORTAL_SECRET: "x" }),
    ).toEqual({ baseUrl: "https://a.test", productSlug: "servd", secret: "x" });
  });
});

describe("deliverEvent", () => {
  it("treats any 200 as delivered — duplicates and refusals included", async () => {
    expect(await deliverEvent(config, event, respond(200, { status: "duplicate" }))).toMatchObject({ kind: "delivered" });
    expect(await deliverEvent(config, event, respond(200, { status: "refused", error: "x" }))).toMatchObject({ kind: "delivered" });
  });

  it("gives up on what retrying cannot fix", async () => {
    for (const s of [400, 413, 422]) {
      expect((await deliverEvent(config, event, respond(s, { error: "bad" }))).kind).toBe("failed");
    }
  });

  it("keeps retrying a 401 (fixed by configuration), 5xx and network errors", async () => {
    expect((await deliverEvent(config, event, respond(401, {}))).kind).toBe("retry");
    expect((await deliverEvent(config, event, respond(503, {}))).kind).toBe("retry");
    const boom = (async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;
    expect(await deliverEvent(config, event, boom)).toMatchObject({ kind: "retry", status: null });
  });

  it("backs off exponentially to a six-hour cap", () => {
    expect(retryDelayMs(1)).toBe(30_000);
    expect(retryDelayMs(2)).toBe(60_000);
    expect(retryDelayMs(5)).toBe(480_000);
    expect(retryDelayMs(40)).toBe(6 * 60 * 60 * 1000);
  });
});

describe("verifyCallback", () => {
  const cb = {
    event_id: "evt_cb_0000001",
    type: "payment.rejected",
    occurred_at: "2026-10-06T00:00:00.000Z",
    data: { external_customer_id: "r1", bank_reference: "BPI-1", reason: "blurry" },
  };
  const req = (body: string, headers: Record<string, string>) => ({
    method: "POST",
    url: "https://servd.test/api/agent-portal/callbacks",
    headers: new Headers(headers),
  });
  const sign = (body: string, slug = "servd", secret = "s3cret") =>
    signedHeaders({ productSlug: slug, secret, method: "POST", pathname: "/api/agent-portal/callbacks", rawBody: body });

  it("accepts a correctly signed callback", () => {
    const body = JSON.stringify(cb);
    const r = verifyCallback(config, req(body, sign(body)), body);
    expect(r.ok && r.callback.type).toBe("payment.rejected");
  });

  it("refuses another product's callback even if it is validly signed", () => {
    const body = JSON.stringify(cb);
    expect(verifyCallback(config, req(body, sign(body, "pharmacy")), body)).toMatchObject({ ok: false, status: 401 });
  });

  it("refuses a bad signature, then bad JSON, then a bad shape", () => {
    const body = JSON.stringify(cb);
    expect(verifyCallback(config, req(body, sign(body, "servd", "nope")), body)).toMatchObject({ status: 401 });
    expect(verifyCallback(config, req("{x", sign("{x")), "{x")).toMatchObject({ status: 400 });
    const bad = JSON.stringify({ ...cb, data: {} });
    expect(verifyCallback(config, req(bad, sign(bad)), bad)).toMatchObject({ status: 422 });
  });
});

describe("uploadReceipt", () => {
  it("refuses a non-image or an oversized file before sending anything", async () => {
    const never = (async () => {
      throw new Error("should not be called");
    }) as unknown as typeof fetch;
    expect((await uploadReceipt(config, new Uint8Array(10), "application/pdf", never)).ok).toBe(false);
    expect((await uploadReceipt(config, new Uint8Array(5 * 1024 * 1024), "image/png", never)).ok).toBe(false);
  });

  it("returns the stored path", async () => {
    const r = await uploadReceipt(config, new Uint8Array([1, 2, 3]), "image/png", respond(200, { receipt_path: "receipts/servd/x.png" }));
    expect(r).toEqual({ ok: true, receiptPath: "receipts/servd/x.png" });
  });
});

describe("referral capture", () => {
  it("keeps a well-formed code and ignores junk", () => {
    expect(refFromSearchParams(new URLSearchParams("ref=abc234"))).toBe("ABC234");
    expect(refFromSearchParams(new URLSearchParams("ref=%3Cscript%3E"))).toBeNull();
    expect(refFromSearchParams(new URLSearchParams("utm_source=fb"))).toBeNull();
  });
});

describe("sniffImageType", () => {
  it("knows JPEG, PNG and WebP by their bytes, and nothing else", () => {
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    const webp = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");
    expect(sniffImageType(webp)).toBe("image/webp");
    expect(sniffImageType(new TextEncoder().encode("<html><script>"))).toBeNull();
  });
});
