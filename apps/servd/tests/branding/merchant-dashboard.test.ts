import { describe, it, expect } from "vitest";
import { codeAt } from "../support/source";

/**
 * A MERCHANT'S DASHBOARD SAYS WHO SOLD IT TO THEM.
 *
 * REPORTED — "add merchant dashboard branding also." A partner-sold shop's
 * dashboard read "Powered by Servd" and offered Servd's tutorials. To that
 * restaurant the PARTNER is the software company: they signed with them, they
 * pay them, and they will ring them first when the printer dies at 7pm.
 *
 * `getMerchantFacingBrand` was written for this and had no callers in the
 * codebase — which is why the brand editor could promise it and nothing
 * happened.
 *
 * TWO IDENTITIES, KEPT APART. `brand` is the RESTAURANT's own — their logo,
 * their name, their colours, on their own screen. `vendor` is who supplies the
 * software. Putting the reseller's colours on a restaurant's dashboard would
 * confuse whose business is whose.
 */

const layout = codeAt("src/app/(platform)/admin/layout.tsx");
const shell = codeAt("src/components/admin/AdminShell.tsx");
const credit = codeAt("src/components/admin/VendorCredit.tsx");

describe("the partner reaches the dashboard chrome", () => {
  it("resolves the merchant-facing brand in the layout", () => {
    expect(layout).toContain("getMerchantFacingBrand(user.restaurantId)");
    expect(layout).toContain("vendor={{");
  });

  it("keeps it separate from the restaurant's own brand", () => {
    // The restaurant's colours still theme the dashboard; the vendor only
    // supplies the credit and the contacts.
    expect(layout).toContain("brandPrimaryColor: restaurant.brandPrimaryColor");
    expect(shell).toContain("brand: { name: string; slug: string; status: string");
    expect(shell).toContain("vendor?: {");
  });

  it("leaves no hard-coded Servd credit in the shell", () => {
    expect(shell).not.toContain("Powered by");
    expect(shell).toContain("<VendorCredit vendor={vendor}");
  });
});

describe("what a partner-sold shop sees", () => {
  it("gets the partner's name, or their logo when there is one", () => {
    expect(credit).toContain("Powered by");
    expect(credit).toContain("vendor?.logoUrl ?");
  });

  it("gets somewhere to ring", () => {
    // The credit is cosmetic. This is not: without it a shop with a problem has
    // Servd's address and nobody who answers it.
    expect(credit).toContain("mailto:");
    expect(credit).toContain("tel:");
    expect(credit).toContain("Get help");
  });

  it("shows no help heading when the partner filled nothing in", () => {
    // A "Get help" heading over an empty list is worse than no heading.
    expect(credit).toContain("partnerSold && contacts.length > 0");
  });
});

describe("what a shop that came direct from Servd sees", () => {
  it("still gets Servd's wordmark", () => {
    expect(credit).toContain("<Wordmark");
  });

  it("gets nothing at all when they paid to remove it", () => {
    // `whiteLabel` is labelled "remove 'Powered by Servd'" and still does
    // exactly that.
    expect(credit).toContain("if (!partnerSold && fullWhiteLabel) return null;");
  });

  it("does not let that feature hide the partner who sold it to them", () => {
    // A reseller's name is not a third party's credit on their software — it
    // is the company they bought it from, and hiding it sends them back to
    // Servd for support.
    const guard = credit.indexOf("if (!partnerSold && fullWhiteLabel) return null;");
    expect(guard).toBeGreaterThan(-1);
    expect(credit).not.toContain("if (fullWhiteLabel) return null;");
  });
});

describe("the brand editor no longer promises what is not built", () => {
  const page = codeAt("src/app/(platform)/partner/brand/page.tsx");

  it("lists the merchant dashboard now that it is wired", () => {
    expect(page).toContain("Your merchants&rsquo; dashboards");
    expect(page).not.toContain("still show Servd");
  });

  it("still says the diner sees the restaurant, not the partner", () => {
    // Getting that backwards puts a reseller's logo on somebody's receipt.
    expect(page).toContain("the restaurant&rsquo;s own brand");
  });
});
