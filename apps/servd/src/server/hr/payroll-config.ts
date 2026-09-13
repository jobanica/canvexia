import "server-only";

import { tenantDb } from "@/server/tenancy/scoped-db";

export interface PayrollConfig {
  sssAmount: number; // fixed centavos per pay period
  philhealthAmount: number;
  pagibigAmount: number;
  birAmount: number;
  thirteenthMonth: boolean;
}

export const DEFAULT_PAYROLL_CONFIG: PayrollConfig = {
  sssAmount: 0,
  philhealthAmount: 0,
  pagibigAmount: 0,
  birAmount: 0,
  thirteenthMonth: false,
};

/** Fixed statutory deduction settings for a restaurant (best-effort; table may lag). */
export async function getPayrollConfig(restaurantId: string): Promise<PayrollConfig> {
  try {
    const s = await tenantDb(restaurantId, (tx) =>
      tx.payrollSetting.findFirst({
        where: { restaurantId },
        select: {
          sssAmount: true,
          philhealthAmount: true,
          pagibigAmount: true,
          birAmount: true,
          thirteenthMonth: true,
        },
      }),
    );
    return s ?? DEFAULT_PAYROLL_CONFIG;
  } catch {
    return DEFAULT_PAYROLL_CONFIG;
  }
}

export interface StatutoryDeductions {
  sss: number;
  philhealth: number;
  pagibig: number;
  bir: number;
  thirteenthAccrual: number;
  total: number; // sss + philhealth + pagibig + bir (deducted from pay)
}

/** Fixed statutory deductions (centavos). 13th-month accrual is 1/12 of base. */
export function computeStatutory(base: number, cfg: PayrollConfig): StatutoryDeductions {
  const sss = cfg.sssAmount;
  const philhealth = cfg.philhealthAmount;
  const pagibig = cfg.pagibigAmount;
  const bir = cfg.birAmount;
  const thirteenthAccrual = cfg.thirteenthMonth ? Math.round(base / 12) : 0;
  return { sss, philhealth, pagibig, bir, thirteenthAccrual, total: sss + philhealth + pagibig + bir };
}
