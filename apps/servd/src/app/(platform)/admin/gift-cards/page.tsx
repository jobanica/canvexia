import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { featureLockOr } from "@/server/billing/feature-lock-gate";
import { listGiftCards, setGiftCardActive } from "@/server/gift-cards/gift-cards";
import { IssueGiftCardForm } from "@/components/admin/IssueGiftCardForm";
import { formatPeso } from "@/lib/money";

/**
 * Gift cards / store credit — issue prepaid cards customers redeem at the
 * counter. Balances are server-authoritative (every move is a ledger entry).
 */
export default async function GiftCardsPage() {
  const { restaurantId } = await requireAdminPage();
  const locked = await featureLockOr(restaurantId, "giftCards", "Gift cards");
  if (locked) return locked;
  const cards = await listGiftCards(restaurantId);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-plum-ink/50">
          ← Dashboard
        </Link>
        <h1 className="font-heading text-2xl font-bold">Gift cards</h1>
        <p className="text-sm text-plum-ink/50">
          Issue prepaid gift cards / store credit. The cashier redeems the code at checkout; the
          balance is tracked here.
        </p>
      </div>

      <IssueGiftCardForm />

      <div className="overflow-x-auto rounded-tile border border-plum-ink/10 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-plum-ink/10 text-left text-xs uppercase tracking-wide text-plum-ink/45">
            <tr>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Balance</th>
              <th className="px-4 py-3">Issued</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-plum-ink/5">
            {cards.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-plum-ink/50">
                  No gift cards yet. Issue one above.
                </td>
              </tr>
            ) : (
              cards.map((c) => {
                const expired = c.expiresAt && c.expiresAt.getTime() < Date.now();
                return (
                  <tr key={c.id}>
                    <td className="px-4 py-3 font-mono font-semibold">{c.code}</td>
                    <td className="px-4 py-3 font-semibold text-brand-primary">{formatPeso(c.balance)}</td>
                    <td className="px-4 py-3 text-plum-ink/60">{formatPeso(c.initialBalance)}</td>
                    <td className="px-4 py-3 text-plum-ink/60">
                      {c.customerName || c.customerPhone || "—"}
                    </td>
                    <td className="px-4 py-3">
                      {!c.active ? (
                        <span className="rounded-full bg-plum-ink/10 px-2 py-0.5 text-xs text-plum-ink/50">Disabled</span>
                      ) : expired ? (
                        <span className="rounded-full bg-guava/15 px-2 py-0.5 text-xs text-guava">Expired</span>
                      ) : (
                        <span className="rounded-full bg-mango/15 px-2 py-0.5 text-xs font-semibold text-mango">Active</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <form action={setGiftCardActive}>
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="active" value={String(c.active)} />
                        <button className="rounded-lg border border-plum-ink/15 px-3 py-1.5 text-xs font-semibold">
                          {c.active ? "Disable" : "Enable"}
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
