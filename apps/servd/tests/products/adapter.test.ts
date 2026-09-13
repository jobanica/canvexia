import { describe, it, expect, beforeEach } from "vitest";
import {
  PRODUCTS,
  __clearProductAdapters,
  getProductAdapter,
  provisionMerchant,
  provisionableProducts,
  registerProductAdapter,
  type ProductAdapter,
  type ProvisionInput,
} from "@servd/core";

/**
 * The dispatch that makes the partner portal product-agnostic.
 *
 * The requirement these protect: adding a vertical must not mean editing the
 * portal. That only holds if the portal's single call can refuse sensibly for
 * every reason a product might not be creatable — and if a registered adapter
 * receives exactly what it was promised.
 */

let received: ProvisionInput | null = null;

const fakeServd: ProductAdapter = {
  productId: "servd",
  async provisionMerchant(input) {
    received = input;
    return { merchantId: "merchant-1", slug: "some-slug" };
  },
};

describe("provisionMerchant dispatch", () => {
  beforeEach(() => {
    __clearProductAdapters();
    received = null;
  });

  describe("refusals", () => {
    it("refuses a product that does not exist", async () => {
      const out = await provisionMerchant("carwash", "partner-1", { name: "A" });
      expect(out).toMatchObject({ ok: false, reason: "unknown_product" });
    });

    it("refuses a product that is listed but not live", async () => {
      // printosph is in the registry so partners can see it coming, with
      // live:false so nobody can open an account in it.
      expect(PRODUCTS.printosph.live).toBe(false);
      const out = await provisionMerchant("printosph", "partner-1", { name: "A" });
      expect(out).toMatchObject({ ok: false, reason: "product_not_live" });
      if (!out.ok) expect(out.message).toMatch(/isn't taking merchants yet/);
    });

    it("reports not-live BEFORE no-adapter", async () => {
      // Both are true for printosph. "Not live" is the useful answer — it is a
      // fact about the product, where a missing adapter is a fact about this
      // deployment and means nothing to the partner reading it.
      const out = await provisionMerchant("printosph", "partner-1", { name: "A" });
      expect(out).toMatchObject({ reason: "product_not_live" });
    });

    it("refuses a live product whose adapter is not registered", async () => {
      const out = await provisionMerchant("servd", "partner-1", { name: "A" });
      expect(out).toMatchObject({ ok: false, reason: "no_adapter" });
    });

    it("refuses a blank name or a missing partner", async () => {
      registerProductAdapter(fakeServd);
      expect(await provisionMerchant("servd", "partner-1", { name: "   " })).toMatchObject({
        reason: "invalid_input",
      });
      expect(await provisionMerchant("servd", "", { name: "A" })).toMatchObject({
        reason: "invalid_input",
      });
    });

    it("never calls the adapter when it refuses", async () => {
      registerProductAdapter(fakeServd);
      await provisionMerchant("printosph", "partner-1", { name: "A" });
      await provisionMerchant("carwash", "partner-1", { name: "A" });
      await provisionMerchant("servd", "partner-1", { name: "" });
      expect(received).toBeNull();
    });
  });

  describe("dispatch", () => {
    beforeEach(() => registerProductAdapter(fakeServd));

    it("hands the adapter the payload plus the partner", async () => {
      const out = await provisionMerchant("servd", "partner-42", {
        name: "Mango Grill",
        address: "Davao",
        phone: "0917",
      });
      expect(out).toEqual({ ok: true, result: { merchantId: "merchant-1", slug: "some-slug" } });
      expect(received).toMatchObject({
        partnerId: "partner-42",
        name: "Mango Grill",
        address: "Davao",
        phone: "0917",
      });
    });

    it("trims the name before the adapter ever sees it", async () => {
      await provisionMerchant("servd", "p", { name: "  Spaced  " });
      expect(received?.name).toBe("Spaced");
    });

    it("passes product-specific fields through untouched", async () => {
      await provisionMerchant("servd", "p", { name: "A", extra: { machines: 12 } });
      expect(received?.extra).toEqual({ machines: 12 });
    });

    it("cannot have the partner overridden by the payload", async () => {
      // The partner comes from the session, never from the form. If a payload
      // field could win, a partner could open accounts owned by someone else.
      const payload = { name: "A", partnerId: "attacker" } as unknown as Omit<
        ProvisionInput,
        "partnerId"
      >;
      await provisionMerchant("servd", "real-partner", payload);
      expect(received?.partnerId).toBe("real-partner");
    });
  });

  describe("registry", () => {
    it("lists only products that are live AND have an adapter", () => {
      expect(provisionableProducts()).toEqual([]);
      registerProductAdapter(fakeServd);
      expect(provisionableProducts()).toEqual(["servd"]);
    });

    it("does not list a registered adapter for a product that is not live", () => {
      registerProductAdapter({ ...fakeServd, productId: "laundry" });
      expect(provisionableProducts()).not.toContain("laundry");
    });

    it("returns null for an unknown product id", () => {
      expect(getProductAdapter("carwash")).toBeNull();
    });
  });
});
