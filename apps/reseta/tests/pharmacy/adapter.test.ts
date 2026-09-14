import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The adapter contract, without a database.
 *
 * What matters here is not that a row gets written — the isolation test covers
 * that — but that Reseta plugs into the platform the way the contract requires:
 * it registers under the right product id, it passes ownership through, and it
 * returns the slug that was actually assigned rather than one it guessed.
 */

const provisionPharmacy = vi.fn();
vi.mock("@/server/pharmacy/provision", () => ({ provisionPharmacy }));

const { resetaAdapter } = await import("@/server/products/reseta-adapter");
const { getProductAdapter, provisionMerchant, PRODUCTS } = await import("@servd/core");

beforeEach(() => {
  provisionPharmacy.mockReset();
  provisionPharmacy.mockResolvedValue({ id: "ph_1", slug: "alpha-botica" });
});

describe("the Reseta product adapter", () => {
  it("registers itself under the pharmacy product id", () => {
    expect(getProductAdapter("pharmacy")).toBe(resetaAdapter);
    expect(resetaAdapter.productId).toBe("pharmacy");
  });

  it("is a product the registry actually knows about", () => {
    expect(PRODUCTS.pharmacy).toBeDefined();
    expect(PRODUCTS.pharmacy.id).toBe("pharmacy");
  });

  it("passes ownership through — the adapter sets it, not the dispatch", async () => {
    await resetaAdapter.provisionMerchant({ partnerId: "partner_1", name: "Alpha Botica" });
    expect(provisionPharmacy).toHaveBeenCalledWith(
      expect.objectContaining({ partnerId: "partner_1", name: "Alpha Botica" }),
    );
  });

  it("returns the slug that was assigned, not one it derived", async () => {
    provisionPharmacy.mockResolvedValue({ id: "ph_9", slug: "alpha-botica-3" });
    const result = await resetaAdapter.provisionMerchant({
      partnerId: "partner_1",
      name: "Alpha Botica",
    });
    // "Alpha Botica" would slug to "alpha-botica"; the -3 came from a collision
    // resolved inside provisionPharmacy. Guessing here would disagree.
    expect(result).toEqual({ merchantId: "ph_9", slug: "alpha-botica-3" });
  });

  it("takes the licence numbers off `extra`, not off the shared shape", async () => {
    await resetaAdapter.provisionMerchant({
      partnerId: "partner_1",
      name: "Alpha Botica",
      extra: { fdaLtoNumber: "  LTO-123  ", prcLicenseNo: "PRC-9", tin: "" },
    });
    const arg = provisionPharmacy.mock.calls[0][0];
    expect(arg.fdaLtoNumber).toBe("LTO-123"); // trimmed
    expect(arg.prcLicenseNo).toBe("PRC-9");
    expect(arg.tin).toBeUndefined(); // blank is absent, not an empty string
  });

  it("ignores non-string junk in `extra` rather than writing it", async () => {
    await resetaAdapter.provisionMerchant({
      partnerId: "partner_1",
      name: "Alpha Botica",
      extra: { fdaLtoNumber: 42, prcLicenseNo: null, tin: { nope: true } },
    });
    const arg = provisionPharmacy.mock.calls[0][0];
    expect(arg.fdaLtoNumber).toBeUndefined();
    expect(arg.prcLicenseNo).toBeUndefined();
    expect(arg.tin).toBeUndefined();
  });

  it("refuses to provision while the product is not live", async () => {
    // The gate that stops a partner opening an account in a product whose
    // adapter has not been proven against a real database. It is checked BEFORE
    // the adapter, so a registered-but-unproven adapter is still unreachable.
    const outcome = await provisionMerchant("pharmacy", "partner_1", { name: "Alpha" });
    if (PRODUCTS.pharmacy.live) {
      expect(outcome.ok).toBe(true);
    } else {
      expect(outcome).toMatchObject({ ok: false, reason: "product_not_live" });
      expect(provisionPharmacy).not.toHaveBeenCalled();
    }
  });
});
