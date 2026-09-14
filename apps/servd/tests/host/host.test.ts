import { describe, it, expect } from "vitest";
import { parseHost } from "@/lib/host";

const ROOT = "servd.app";

describe("parseHost", () => {
  it("treats the root + www + vercel previews as platform", () => {
    expect(parseHost("servd.app", ROOT).kind).toBe("platform");
    expect(parseHost("www.servd.app", ROOT).kind).toBe("platform");
    expect(parseHost("servd-abc.vercel.app", ROOT).kind).toBe("platform");
    expect(parseHost("localhost", ROOT).kind).toBe("platform");
  });

  it("extracts a subdomain", () => {
    const r = parseHost("mango-grill.servd.app", ROOT);
    expect(r.kind).toBe("subdomain");
    if (r.kind === "subdomain") expect(r.subdomain).toBe("mango-grill");
  });

  it("keeps reserved labels on the platform", () => {
    expect(parseHost("app.servd.app", ROOT).kind).toBe("platform");
    expect(parseHost("api.servd.app", ROOT).kind).toBe("platform");
  });

  it("treats a foreign domain as custom", () => {
    const r = parseHost("order.mybistro.com", ROOT);
    expect(r.kind).toBe("custom");
    if (r.kind === "custom") expect(r.host).toBe("order.mybistro.com");
  });

  it("strips the port", () => {
    expect(parseHost("mango.localhost:3000", "localhost").kind).toBe("subdomain");
  });
});

/**
 * Partner hosts.
 *
 * The safety property first: `partnerRootDomain` is unset in production, and
 * with it absent NOT ONE input may resolve differently than before. That is what
 * lets this ship ahead of the domain being configured.
 */
describe("parseHost — partner root domain", () => {
  const MERCHANT_ROOT = "servd.app";
  const PARTNER_ROOT = "canvexia.app";

  describe("inert until configured", () => {
    const hosts = [
      "servd.app",
      "www.servd.app",
      "mango-grill.servd.app",
      "order.bistro.com",
      "cebu.canvexia.app",
      "canvexia.app",
      "localhost",
      "preview.vercel.app",
      "tutorials.servd.app",
      "",
    ];

    it.each(hosts)("%s resolves the same with the parameter omitted", (host) => {
      expect(parseHost(host, MERCHANT_ROOT, undefined)).toEqual(parseHost(host, MERCHANT_ROOT));
    });

    it("a partner host is just a custom domain while unconfigured", () => {
      // Which is what it is today: cebu.canvexia.app means nothing to the app.
      expect(parseHost("cebu.canvexia.app", MERCHANT_ROOT)).toEqual({
        kind: "custom",
        host: "cebu.canvexia.app",
      });
    });
  });

  describe("once configured", () => {
    const p = (host: string) => parseHost(host, MERCHANT_ROOT, PARTNER_ROOT);

    it("resolves a partner subdomain to that partner", () => {
      expect(p("cebu.canvexia.app")).toEqual({
        kind: "partner",
        slug: "cebu",
        host: "cebu.canvexia.app",
      });
    });

    it("is case-insensitive and drops the port", () => {
      expect(p("CEBU.Canvexia.App:3000")).toEqual({
        kind: "partner",
        slug: "cebu",
        host: "cebu.canvexia.app",
      });
    });

    it("serves the bare partner root and www as CANVEXIA's OWN front door", () => {
      // Not "platform", which is Servd's. These used to be the same answer,
      // back when the partner root was a domain nobody had configured. Getting
      // it wrong now means canvexia.com showing a page about online ordering
      // for restaurants.
      expect(p("canvexia.app")).toEqual({ kind: "partner_root", host: "canvexia.app" });
      expect(p("www.canvexia.app")).toEqual({
        kind: "partner_root",
        host: "www.canvexia.app",
      });
    });

    it("keeps the other reserved labels on the platform", () => {
      // `www` is deliberately NOT in this list any more — on the partner root
      // it is the front door, not a reserved label.
      for (const label of ["app", "admin", "api", "tutorials"]) {
        expect(p(`${label}.canvexia.app`).kind).toBe("platform");
      }
    });

    it("leaves merchant subdomains alone", () => {
      expect(p("mango-grill.servd.app")).toEqual({
        kind: "subdomain",
        subdomain: "mango-grill",
        host: "mango-grill.servd.app",
      });
    });

    it("leaves a merchant's own custom domain alone", () => {
      expect(p("order.bistro.com")).toEqual({ kind: "custom", host: "order.bistro.com" });
    });

    it("does not match a lookalike domain", () => {
      // notcanvexia.app must not be read as a subdomain of canvexia.app.
      expect(p("notcanvexia.app")).toEqual({ kind: "custom", host: "notcanvexia.app" });
    });
  });
});

/**
 * The domains this actually runs on (D31). Spelled out rather than left to the
 * generic cases above, because a routing mistake between these three is not a
 * subtle bug: it is one brand's front page served at another brand's address.
 */
describe("parseHost — the configured domains", () => {
  const SERVD = "servdph.net";
  const CANVEXIA = "canvexia.com";
  const h = (host: string) => parseHost(host, SERVD, CANVEXIA);

  it("serves Servd at its own root", () => {
    expect(h("servdph.net").kind).toBe("platform");
    expect(h("www.servdph.net").kind).toBe("platform");
  });

  it("serves CANVEXIA at its own root — not Servd", () => {
    expect(h("canvexia.com").kind).toBe("partner_root");
    expect(h("www.canvexia.com").kind).toBe("partner_root");
  });

  it("gives a partner their own subdomain of canvexia.com", () => {
    expect(h("davao.canvexia.com")).toEqual({
      kind: "partner",
      slug: "davao",
      host: "davao.canvexia.com",
    });
  });

  it("gives a merchant a subdomain of servdph.net", () => {
    expect(h("mango-grill.servdph.net")).toEqual({
      kind: "subdomain",
      subdomain: "mango-grill",
      host: "mango-grill.servdph.net",
    });
  });

  it("does not confuse the two roots with each other", () => {
    // A partner slug resolving as a restaurant, or vice versa, is the failure
    // the ordering in parseHost exists to prevent.
    expect(h("davao.canvexia.com").kind).toBe("partner");
    expect(h("davao.servdph.net").kind).toBe("subdomain");
  });

  it("still treats a merchant's own domain as custom", () => {
    expect(h("order.bistro.ph")).toEqual({ kind: "custom", host: "order.bistro.ph" });
  });

  it("does not treat the OLD Servd domain as anything special", () => {
    // servdph.com is a different business on a different database (D31). If it
    // ever points here, it is somebody else's custom domain and nothing more.
    expect(h("servdph.com")).toEqual({ kind: "custom", host: "servdph.com" });
    expect(h("www.servdph.com")).toEqual({ kind: "custom", host: "www.servdph.com" });
  });

  it("treats risceta.com as a custom host here — Reseta is its own app", () => {
    // Reseta is deployed separately and does no host routing; it never reaches
    // this function. If the domain were pointed at Servd by mistake, it would
    // be looked up as a restaurant and not found, which is the honest answer.
    expect(h("risceta.com")).toEqual({ kind: "custom", host: "risceta.com" });
  });
});
