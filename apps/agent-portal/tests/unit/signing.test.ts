import { describe, it, expect } from "vitest";
import {
  signRequest,
  signedHeaders,
  verifyRequest,
  SIGNATURE_HEADERS,
} from "@servd/core/agent-kit";

const SECRET = "cvx_test_secret";
const NOW = new Date("2026-10-06T04:00:00Z");
const ts = String(Math.floor(NOW.getTime() / 1000));
const body = '{"event_id":"e1","type":"customer.cancelled"}';

function verify(over: Partial<Parameters<typeof verifyRequest>[0]> = {}) {
  return verifyRequest({
    secret: SECRET,
    timestamp: ts,
    signature: signRequest(SECRET, ts, "POST", "/api/v1/events", body),
    method: "POST",
    pathname: "/api/v1/events",
    rawBody: body,
    now: NOW,
    ...over,
  });
}

describe("request signing", () => {
  it("accepts a correctly signed request", () => {
    expect(verify()).toEqual({ ok: true });
  });

  it("produces headers that verify", () => {
    const h = signedHeaders({ productSlug: "servd", secret: SECRET, method: "post", pathname: "/api/v1/events", rawBody: body, now: NOW });
    expect(h[SIGNATURE_HEADERS.product]).toBe("servd");
    expect(verify({ timestamp: h[SIGNATURE_HEADERS.timestamp], signature: h[SIGNATURE_HEADERS.signature] })).toEqual({ ok: true });
  });

  it("refuses a body changed by one byte", () => {
    expect(verify({ rawBody: body.replace("e1", "e2") })).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("refuses the wrong secret", () => {
    expect(verify({ secret: "other" })).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("refuses a signature replayed against another endpoint", () => {
    expect(verify({ pathname: "/api/v1/codes/ABC" })).toEqual({ ok: false, reason: "bad_signature" });
    expect(verify({ method: "GET" })).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("refuses a request older than five minutes", () => {
    expect(verify({ now: new Date(NOW.getTime() + 301_000) })).toEqual({ ok: false, reason: "stale" });
    expect(verify({ now: new Date(NOW.getTime() + 299_000) })).toEqual({ ok: true });
  });

  it("refuses a timestamp from the future too", () => {
    expect(verify({ now: new Date(NOW.getTime() - 301_000) })).toEqual({ ok: false, reason: "stale" });
  });

  it("refuses a fresh timestamp on an old signature", () => {
    // The timestamp is inside the signed string, so changing it breaks the MAC.
    const later = String(Number(ts) + 60);
    expect(verify({ timestamp: later, now: new Date((Number(ts) + 60) * 1000) })).toEqual({
      ok: false,
      reason: "bad_signature",
    });
  });

  it("treats missing or garbled headers as malformed", () => {
    expect(verify({ timestamp: null })).toEqual({ ok: false, reason: "malformed" });
    expect(verify({ signature: "sha256=zz" })).toEqual({ ok: false, reason: "malformed" });
    expect(verify({ timestamp: "12abc" })).toEqual({ ok: false, reason: "malformed" });
  });
});
