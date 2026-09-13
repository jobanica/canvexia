import { describe, it, expect } from "vitest";
import {
  readUtmParams,
  encodeUtm,
  decodeUtm,
  hasUtm,
  utmQuery,
  withUtm,
  utmLabel,
  EMPTY_UTM,
} from "@/lib/utm";

const q = (s: string) => new URLSearchParams(s);

describe("readUtmParams", () => {
  it("reads all four tags", () => {
    expect(
      readUtmParams(q("utm_source=facebook&utm_medium=paid&utm_campaign=davao-jan&utm_content=vid3")),
    ).toEqual({ source: "facebook", medium: "paid", campaign: "davao-jan", content: "vid3" });
  });

  it("reads a partial tag set", () => {
    expect(readUtmParams(q("utm_campaign=davao-jan"))).toEqual({
      ...EMPTY_UTM,
      campaign: "davao-jan",
    });
  });

  // THE important case. A reload of /create carries no params, and the capture
  // must not wipe the attribution from the ad click that got them there.
  it("returns null for a URL with no tags at all", () => {
    expect(readUtmParams(q(""))).toBeNull();
    expect(readUtmParams(q("go=activate&foo=bar"))).toBeNull();
  });

  // We know the click came through Facebook. We do NOT know it was paid, and
  // labelling an organic share as ad traffic would corrupt the one report the
  // budget decisions are made from.
  it("records a bare fbclid as facebook, without claiming it was paid", () => {
    expect(readUtmParams(q("fbclid=IwAR123"))).toEqual({ ...EMPTY_UTM, source: "facebook" });
  });

  it("lets an explicit utm_source win over fbclid", () => {
    expect(readUtmParams(q("utm_source=ig&fbclid=IwAR123"))?.source).toBe("ig");
  });

  it("caps a long value so it can't bloat the cookie", () => {
    const long = "x".repeat(200);
    expect(readUtmParams(q(`utm_campaign=${long}`))?.campaign).toHaveLength(60);
  });

  // A hand-typed URL must not be able to inject a newline into Set-Cookie.
  it("strips control characters", () => {
    const params = new URLSearchParams();
    params.set("utm_source", "face\nbook\r\n");
    expect(readUtmParams(params)?.source).toBe("facebook");
  });
});

describe("encode / decode", () => {
  const utm = { source: "facebook", medium: "paid", campaign: "davao jan", content: "vid/3" };

  it("round-trips through the cookie value", () => {
    expect(decodeUtm(encodeUtm(utm))).toEqual(utm);
  });

  it("produces a cookie-safe value for awkward characters", () => {
    const encoded = encodeUtm(utm);
    expect(encoded).not.toMatch(/[;,\s]/);
    expect(decodeUtm(encoded).campaign).toBe("davao jan");
  });

  it("decodes a missing or junk cookie to empty rather than throwing", () => {
    expect(decodeUtm(null)).toEqual(EMPTY_UTM);
    expect(decodeUtm(undefined)).toEqual(EMPTY_UTM);
    expect(decodeUtm("%%%")).toEqual(EMPTY_UTM);
  });

  it("skips empty fields instead of writing blanks", () => {
    expect(encodeUtm({ ...EMPTY_UTM, source: "fb" })).toBe("s=fb");
    expect(encodeUtm(EMPTY_UTM)).toBe("");
  });
});

describe("hasUtm", () => {
  it("is false only when every field is empty", () => {
    expect(hasUtm(EMPTY_UTM)).toBe(false);
    expect(hasUtm({ ...EMPTY_UTM, content: "v1" })).toBe(true);
  });
});

describe("withUtm", () => {
  it("hangs the tags off a CTA href", () => {
    expect(withUtm("/build", { ...EMPTY_UTM, source: "facebook", campaign: "c1" })).toBe(
      "/build?utm_source=facebook&utm_campaign=c1",
    );
  });

  it("leaves the href untouched when there's nothing to carry", () => {
    expect(withUtm("/build", EMPTY_UTM)).toBe("/build");
  });

  it("appends to a href that already has a query", () => {
    expect(withUtm("/build?go=activate", { ...EMPTY_UTM, source: "fb" })).toBe(
      "/build?go=activate&utm_source=fb",
    );
  });

  it("escapes a value with a space", () => {
    expect(utmQuery({ ...EMPTY_UTM, campaign: "davao jan" })).toBe("utm_campaign=davao+jan");
  });
});

describe("utmLabel", () => {
  it("joins the tags that are present", () => {
    expect(utmLabel({ source: "facebook", medium: "paid", campaign: "c1", content: "" })).toBe(
      "facebook · paid · c1",
    );
  });

  it("names the untagged bucket rather than showing a blank row", () => {
    expect(utmLabel(EMPTY_UTM)).toBe("Direct / untagged");
  });
});
