import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  appUrl,
  appLink,
  appHost,
  internalLoginDomain,
  isSyntheticLogin,
  outboundUserAgent,
  supportMessengerUrl,
  metadataBaseUrl,
} from "@/lib/branding/app-domain";

/**
 * The rule these all share: a wrong domain is worse than no domain.
 *
 * The badge at the foot of a diner's page is the one piece of Servd they see.
 * Sending them to a site this deployment does not run — which is exactly what a
 * hardcoded `servdph.com` does once CANVEXIA runs Servd somewhere else (D31) —
 * is the failure worth engineering against. So everything here degrades to
 * ABSENT or to a relative link, never to a guess.
 */
const ENV = ["NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_ROOT_DOMAIN", "INTERNAL_LOGIN_DOMAIN", "NEXT_PUBLIC_SUPPORT_MESSENGER"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("the public URL", () => {
  it("is empty when unset, so links stay on this site", () => {
    expect(appUrl()).toBe("");
    expect(appLink("/create")).toBe("/create");
    expect(appLink("/")).toBe("/");
  });

  it("never invents a domain", () => {
    // The whole point. A literal here would outlive the business that owns it.
    expect(appUrl()).not.toMatch(/servdph/);
    expect(appLink("/")).not.toMatch(/https?:/);
  });

  it("uses the configured URL and trims a trailing slash", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://www.example.ph/";
    expect(appUrl()).toBe("https://www.example.ph");
    expect(appLink("/create")).toBe("https://www.example.ph/create");
  });

  it("accepts a path with or without a leading slash", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://www.example.ph";
    expect(appLink("create")).toBe("https://www.example.ph/create");
  });
});

describe("the host, for display", () => {
  it("is null when unset, so the caller renders nothing", () => {
    // Not "", which would leave an empty line where an address should be.
    expect(appHost()).toBeNull();
  });

  it("is the bare host — no scheme, no path", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://www.example.ph/create";
    expect(appHost()).toBe("www.example.ph");
  });

  it("survives a malformed URL rather than taking a diner page down", () => {
    process.env.NEXT_PUBLIC_APP_URL = "not a url";
    expect(appHost()).toBeNull();
  });
});

describe("the internal login domain", () => {
  it("prefers the explicit setting", () => {
    process.env.INTERNAL_LOGIN_DOMAIN = "internal.example.com";
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = "example.ph";
    expect(internalLoginDomain()).toBe("internal.example.com");
  });

  it("derives from the root domain when there is no explicit one", () => {
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = "example.ph";
    expect(internalLoginDomain()).toBe("staff.example.ph");
  });

  it("falls back to a domain that CANNOT resolve", () => {
    // Nothing is ever delivered to these addresses, which is exactly why the
    // fallback must not be a real domain somebody else owns. `.invalid` is
    // reserved by RFC 2606 so it can never be registered.
    expect(internalLoginDomain()).toBe("staff.invalid");
  });
});

describe("recognising a synthetic login", () => {
  beforeEach(() => {
    process.env.INTERNAL_LOGIN_DOMAIN = "staff.example.ph";
  });

  it("spots one on the configured domain", () => {
    expect(isSyntheticLogin("bunwitch@staff.example.ph")).toBe(true);
    expect(isSyntheticLogin("BUNWITCH@STAFF.EXAMPLE.PH")).toBe(true);
  });

  it("leaves a real inbox alone", () => {
    expect(isSyntheticLogin("owner@example.ph")).toBe(false);
    expect(isSyntheticLogin("owner@gmail.com")).toBe(false);
    // A near-miss is not a match: notstaff.example.ph is somebody's real domain.
    expect(isSyntheticLogin("owner@notstaff.example.ph")).toBe(false);
  });

  it("handles nothing at all", () => {
    expect(isSyntheticLogin(null)).toBe(false);
    expect(isSyntheticLogin("")).toBe(false);
  });

  it("follows the domain when the deployment moves", () => {
    // The bug this replaces: the check was written with the domain spelled out,
    // so on a new domain every internal address read as a real customer inbox
    // and the reply form would claim an answer had been emailed.
    process.env.INTERNAL_LOGIN_DOMAIN = "staff.newdomain.ph";
    expect(isSyntheticLogin("shop@staff.example.ph")).toBe(false);
    expect(isSyntheticLogin("shop@staff.newdomain.ph")).toBe(true);
  });
});

describe("the outbound user agent", () => {
  it("identifies the tool alone when there is no URL to give", () => {
    expect(outboundUserAgent("ServdProspecting/1.0")).toBe("ServdProspecting/1.0");
  });

  it("adds the contact URL when there is one", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://www.example.ph";
    expect(outboundUserAgent("ServdProspecting/1.0")).toBe(
      "ServdProspecting/1.0 (+https://www.example.ph)",
    );
  });
});

describe("the support link", () => {
  it("points at this site's own contact page when unconfigured", () => {
    // Never at a Facebook page belonging to someone else.
    expect(supportMessengerUrl()).toBe("/contact");
  });

  it("builds a Messenger link from a handle", () => {
    process.env.NEXT_PUBLIC_SUPPORT_MESSENGER = "@examplepharma";
    expect(supportMessengerUrl()).toBe("https://m.me/examplepharma");
  });

  it("passes a full URL through unchanged", () => {
    process.env.NEXT_PUBLIC_SUPPORT_MESSENGER = "https://wa.me/639170000000";
    expect(supportMessengerUrl()).toBe("https://wa.me/639170000000");
  });
});

describe("metadataBase", () => {
  it("is undefined when unset, rather than throwing at build time", () => {
    // `new URL("")` throws, and it throws while Next collects page data — so
    // the whole app fails to BUILD on a deployment that has not set its domain
    // yet. The build caught this; this test keeps it caught.
    expect(metadataBaseUrl()).toBeUndefined();
  });

  it("is undefined for a malformed URL, for the same reason", () => {
    process.env.NEXT_PUBLIC_APP_URL = "not a url";
    expect(metadataBaseUrl()).toBeUndefined();
  });

  it("is the configured URL when there is one", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://www.example.ph";
    expect(metadataBaseUrl()?.href).toBe("https://www.example.ph/");
  });
});
