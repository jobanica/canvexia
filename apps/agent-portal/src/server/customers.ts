import "server-only";
import type { CustomerTermsResponse } from "@servd/core/agent-kit";
import { systemDb } from "@/server/scoped-db";

/** GET /api/v1/customers/{id}. Scoped to the calling product by its id. */
export async function customerTerms(productId: string, externalCustomerId: string): Promise<CustomerTermsResponse> {
  return systemDb(async (tx) => {
    const r = await tx.agentReferral.findUnique({
      where: { productId_externalCustomerId: { productId, externalCustomerId } },
      select: {
        id: true,
        status: true,
        paidMonths: true,
        rule: { select: { activationFee: true, monthlyFee: true } },
      },
    });
    if (!r) {
      return {
        external_customer_id: externalCustomerId,
        known: false,
        status: null,
        paid_months: 0,
        activation_fee: null,
        monthly_fee: null,
        activation_confirmed: false,
        contract_signed: false,
      };
    }
    const [activation, contracts] = await Promise.all([
      tx.agentPayment.count({ where: { referralId: r.id, type: "activation", status: "confirmed" } }),
      tx.agentContract.count({ where: { referralId: r.id } }),
    ]);
    return {
      external_customer_id: externalCustomerId,
      known: true,
      status: r.status,
      paid_months: r.paidMonths,
      activation_fee: r.rule?.activationFee ?? null,
      monthly_fee: r.rule?.monthlyFee ?? null,
      activation_confirmed: activation > 0,
      contract_signed: contracts > 0,
    };
  });
}
