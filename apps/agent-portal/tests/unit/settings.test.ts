import { describe, it, expect } from "vitest";
import { parseSettingsForm, resolveSettings, SETTING_DEFAULTS } from "@/lib/settings";

describe("settings", () => {
  it("defaults to the values in the brief", () => {
    expect(resolveSettings([]).settings).toEqual({
      activation_commission_release_month: 1,
      residual_max_months: null,
      residual_requires_active_agent: false,
      active_agent_window_days: 90,
      payout_day_of_month: 15,
      payout_minimum_amount: 50_000,
      late_referral_code_days: 14,
      allow_self_referral: false,
      contract_minimum_months: 3,
    });
  });

  it("stored rows override defaults; unreadable rows fall back and are reported", () => {
    const { settings, invalid } = resolveSettings([
      { key: "payout_day_of_month", value: 10 },
      { key: "residual_max_months", value: "lots" },
      { key: "not_a_setting", value: 1 },
    ]);
    expect(settings.payout_day_of_month).toBe(10);
    expect(settings.residual_max_months).toBeNull();
    expect(invalid).toEqual(["residual_max_months"]);
  });

  const form = {
    activation_commission_release_month: "3",
    residual_max_months: "",
    active_agent_window_days: "90",
    payout_day_of_month: "15",
    payout_minimum_amount: "500.00",
    late_referral_code_days: "14",
    contract_minimum_months: "3",
  };

  it("parses the form: pesos to centavos, blank cap to null, unticked boxes to false", () => {
    const r = parseSettingsForm(form);
    expect(r).toEqual({
      ok: true,
      settings: { ...SETTING_DEFAULTS, activation_commission_release_month: 3 },
    });
  });

  it("refuses a payout day the month may not have", () => {
    expect(parseSettingsForm({ ...form, payout_day_of_month: "31" }).ok).toBe(false);
  });

  it("refuses a blank required number", () => {
    expect(parseSettingsForm({ ...form, contract_minimum_months: "" }).ok).toBe(false);
  });
});
