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

    it("treats the bare partner root and www as platform", () => {
      expect(p("canvexia.app").kind).toBe("platform");
      expect(p("www.canvexia.app").kind).toBe("platform");
    });

    it("keeps reserved labels on the platform", () => {
      for (const label of ["www", "app", "admin", "api", "tutorials"]) {
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
