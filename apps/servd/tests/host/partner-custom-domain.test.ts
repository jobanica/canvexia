import { describe, it, expect } from "vitest";
import { parseHost } from "@/lib/host";
import { normaliseHost } from "@/lib/partners/custom-host";
import { codeAt } from "../support/source";

/**
 * A PARTNER'S OWN DOMAIN HAS TO SERVE THEIR PORTAL.
 *
 * REPORTED — a partner connected www.myrestoph.asia. The portal's own record
 * said "active", Vercel said verified, the DNS was right and the certificate
 * was valid. The address served a 404.
 *
 * Every layer below the app was working. `parseHost` routes by the SHAPE of a
 * hostname — that is what keeps it pure and Edge-safe — and no shape
 * distinguishes a partner's domain from a restaurant's, so it answered
 * `custom`, the middleware rewrote to /sites/www.myrestoph.asia, and the
 * restaurant lookup correctly found nothing.
 *
 * The state machine was telling the truth about DNS and lying about the
 * product. "Active" has to mean the address works.
 */

const mw = codeAt("src/middleware.ts");
const api = codeAt("src/app/api/partner-host/route.ts");

describe("shape still cannot answer it, and no longer pretends to", () => {
  it("classifies an arbitrary domain as custom, as before", () => {
    // Unchanged on purpose: parseHost stays pure. A partner domain is resolved
    // by the middleware asking, not by this function guessing.
    expect(parseHost("www.myrestoph.asia", "servdph.net", "canvexia.com")).toEqual({
      kind: "custom",
      host: "www.myrestoph.asia",
    });
  });

  it("still routes a canvexia.com subdomain by shape alone", () => {
    // The cheap path has to stay cheap: no lookup for a host whose shape says
    // portal.
    expect(parseHost("cebu.canvexia.com", "servdph.net", "canvexia.com")).toEqual({
      kind: "partner",
      slug: "cebu",
      host: "cebu.canvexia.com",
    });
  });
});

describe("the middleware asks, and cannot be taken down by the answer", () => {
  it("only asks for a custom host", () => {
    // A platform host, a merchant subdomain and a partner subdomain must not
    // pay for a lookup they cannot need.
    expect(mw).toContain('info.kind === "custom" ? await partnerHost(req, host) : null');
  });

  it("falls back to today's behaviour on any failure", () => {
    // false is the tenant rewrite, which is exactly what this file did before.
    // A partner domain 404s again; nothing else breaks.
    const fn = mw.slice(mw.indexOf("async function partnerHost"));
    expect(fn).toContain("catch {");
    expect(fn).toContain("return { partner: false };");
    expect(fn).toContain("if (!res.ok) return { partner: false };");
  });

  it("does not cache a failure", () => {
    // A cached "no" from one blip would take a partner's domain down for a
    // minute after it had already recovered.
    const fn = mw.slice(mw.indexOf("async function partnerHost"));
    const fail = fn.indexOf("if (!res.ok) return { partner: false };");
    const store = fn.indexOf("hostCache.set");
    expect(fail).toBeGreaterThan(-1);
    expect(store).toBeGreaterThan(fail);
  });

  it("bounds a map keyed by an attacker-controlled header", () => {
    expect(mw).toContain("if (hostCache.size >= HOST_CACHE_MAX) hostCache.clear();");
  });

  it("caches the negative too, so a merchant domain asks once a minute", () => {
    const fn = mw.slice(mw.indexOf("async function partnerHost"));
    // One set, reached by both answers, rather than a set inside the true arm.
    expect(fn.split("hostCache.set").length - 1).toBe(1);
  });
});

describe("one portal, one address", () => {
  it("redirects the spelling the partner did not register", () => {
    // Serving at both www and the apex splits every cookie the session
    // depends on.
    expect(mw).toContain("NextResponse.redirect(to, 308)");
    expect(mw).toContain("owned.canonical !== host");
  });

  it("answers for both spellings so neither is a dead address", () => {
    expect(api).toContain('asked.startsWith("www.") ? asked.slice(4) : `www.${asked}`');
    expect(api).toContain("customDomain: { in: [asked, counterpart] }");
  });

  it("names the registered spelling as canonical", () => {
    expect(api).toContain("canonical: row.customDomain");
  });
});

describe("what the lookup will and will not say", () => {
  it("serves nothing for a partner who is not approved", () => {
    // Suspension is the one lever that takes an operator's portal off the
    // internet. A domain that kept serving would make it decorative.
    expect(api).toContain('status: "approved"');
  });

  it("gives back no identity, only whether and which spelling", () => {
    // It is unauthenticated — the middleware has no session to present — so it
    // must not become a dictionary of every partner domain on the platform.
    expect(api).toContain("select: { customDomain: true }");
    expect(api).not.toContain("name: true");
    expect(api).not.toContain("slug: true");
  });

  it("normalises the host it was handed before matching", () => {
    // The stored value went through the same function, so a trailing dot or a
    // capital must not be the reason a domain does not resolve.
    expect(api).toContain("normaliseHost(");
    expect(normaliseHost("WWW.MyRestoPH.asia.")).toBe("www.myrestoph.asia");
  });

  it("keeps HQ off an operator's address", () => {
    // /hq passes through on CANVEXIA's own front door only. A partner's domain
    // is the operator's, and CANVEXIA's console has no business answering
    // there.
    expect(mw).toContain('portal === "partner_root" &&');
  });
});
