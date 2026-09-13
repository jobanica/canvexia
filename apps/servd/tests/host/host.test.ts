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
