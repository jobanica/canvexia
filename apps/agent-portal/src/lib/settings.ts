import { z } from "zod";

/**
 * Admin-editable settings — the business decisions that are not final yet.
 *
 * Each one is a row in `agent_settings`, keyed by the names below. The values
 * here are the defaults the owner set in the brief, used for any key with no
 * row yet: a fresh portal behaves as specified without a seeding step, and the
 * first save from /admin/settings writes the row.
 *
 * Money is centavos, like everywhere else.
 */
export const settingsSchema = z.object({
  /** The paid month at which the activation commission becomes payable. 1 = immediately. */
  activation_commission_release_month: z.number().int().min(1).max(24),
  /** Cap on how many tier-2 (₱100) months are paid. Null = no cap. */
  residual_max_months: z.number().int().min(1).max(600).nullable(),
  /** Pay tier-2 only to an agent who referred someone recently. */
  residual_requires_active_agent: z.boolean(),
  /** "Recently", for the setting above. */
  active_agent_window_days: z.number().int().min(1).max(3650),
  payout_day_of_month: z.number().int().min(1).max(28),
  /** Centavos. A balance under this carries forward to the next payout. */
  payout_minimum_amount: z.number().int().min(0),
  /** How long after signup an admin may still attach a missing code. */
  late_referral_code_days: z.number().int().min(0).max(365),
  allow_self_referral: z.boolean(),
  contract_minimum_months: z.number().int().min(1).max(60),
});

export type PortalSettings = z.infer<typeof settingsSchema>;
export type SettingKey = keyof PortalSettings;

export const SETTING_DEFAULTS: PortalSettings = {
  activation_commission_release_month: 1,
  residual_max_months: null,
  residual_requires_active_agent: false,
  active_agent_window_days: 90,
  payout_day_of_month: 15,
  payout_minimum_amount: 50_000,
  late_referral_code_days: 14,
  allow_self_referral: false,
  contract_minimum_months: 3,
};

export const SETTING_KEYS = Object.keys(SETTING_DEFAULTS) as SettingKey[];

/**
 * Stored rows → settings. A key with no row takes its default. A row that no
 * longer parses (someone edited it by hand) also takes its default, and is
 * reported in `invalid` so the settings page can say so rather than quietly
 * running on a value nobody chose.
 */
export function resolveSettings(rows: { key: string; value: unknown }[]): {
  settings: PortalSettings;
  invalid: SettingKey[];
} {
  const settings: Record<string, unknown> = { ...SETTING_DEFAULTS };
  const invalid: SettingKey[] = [];
  const shape = settingsSchema.shape;
  for (const row of rows) {
    if (!(row.key in shape)) continue;
    const key = row.key as SettingKey;
    const parsed = shape[key].safeParse(row.value);
    if (parsed.success) settings[key] = parsed.data;
    else invalid.push(key);
  }
  return { settings: settings as PortalSettings, invalid };
}

/**
 * The admin form → settings. Text inputs in, typed values out. Pesos on the
 * form, centavos in storage, so nobody types 50000 meaning ₱500.
 */
export function parseSettingsForm(
  form: Record<string, string | undefined>,
): { ok: true; settings: PortalSettings } | { ok: false; error: string } {
  const int = (v: string | undefined) => (v === undefined || v.trim() === "" ? NaN : Number(v));
  const bool = (v: string | undefined) => v === "on" || v === "true";
  const pesos = (v: string | undefined) => {
    if (v === undefined || !/^\d+(\.\d{1,2})?$/.test(v.trim())) return NaN;
    return Math.round(Number(v.trim()) * 100);
  };
  const residualCap = form.residual_max_months?.trim();

  const parsed = settingsSchema.safeParse({
    activation_commission_release_month: int(form.activation_commission_release_month),
    residual_max_months: residualCap ? int(residualCap) : null,
    residual_requires_active_agent: bool(form.residual_requires_active_agent),
    active_agent_window_days: int(form.active_agent_window_days),
    payout_day_of_month: int(form.payout_day_of_month),
    payout_minimum_amount: pesos(form.payout_minimum_amount),
    late_referral_code_days: int(form.late_referral_code_days),
    allow_self_referral: bool(form.allow_self_referral),
    contract_minimum_months: int(form.contract_minimum_months),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `${issue.path.join(".")}: ${issue.message}` };
  }
  return { ok: true, settings: parsed.data };
}
