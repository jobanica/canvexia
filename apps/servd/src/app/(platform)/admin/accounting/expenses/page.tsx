import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { getExpenses } from "@/server/accounting/queries";
import { addExpense, deleteExpense } from "@/server/accounting/actions";
import { formatPeso } from "@/lib/money";
import { manilaDate } from "@/lib/time/manila";

function range(p: "this" | "last") {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() - (p === "last" ? 1 : 0);
  const from = new Date(y, m, 1);
  const to = p === "last" ? new Date(y, m + 1, 0, 23, 59, 59) : now;
  return { from, to };
}

const CATEGORIES = ["Rent", "Utilities", "Supplies", "Ingredients", "Payroll", "Marketing", "Equipment", "Other"];

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { restaurantId } = await requireAdminPage();
  const period = (await searchParams).period === "last" ? "last" : "this";
  const { from, to } = range(period);
  const expenses = await getExpenses(restaurantId, from, to);
  const total = expenses.reduce((s, e) => s + e.amount, 0);

  const byCat = new Map<string, number>();
  for (const e of expenses) byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amount);

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin/accounting" className="text-sm text-plum-ink/50">← Accounting</Link>
          <h1 className="font-heading text-2xl font-bold">Expenses</h1>
          <p className="text-sm text-plum-ink/50">{manilaDate(from)} – {manilaDate(to)}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/accounting/expenses?period=this" className={`rounded-full px-3 py-1 text-sm font-semibold ${period === "this" ? "btn-brand text-white" : "border border-plum-ink/15"}`}>This month</Link>
          <Link href="/admin/accounting/expenses?period=last" className={`rounded-full px-3 py-1 text-sm font-semibold ${period === "last" ? "btn-brand text-white" : "border border-plum-ink/15"}`}>Last month</Link>
        </div>
      </div>

      {/* Add */}
      <form action={addExpense} className="grid gap-3 rounded-tile border border-plum-ink/10 bg-white p-4 sm:grid-cols-5">
        <input type="date" name="date" defaultValue={todayStr} required className="rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />
        <select name="category" className="rounded-lg border border-plum-ink/15 px-3 py-2 text-sm">
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input name="amount" type="number" step="0.01" min="0" placeholder="Amount ₱" required className="rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />
        <input name="note" placeholder="Note (optional)" className="rounded-lg border border-plum-ink/15 px-3 py-2 text-sm sm:col-span-1" />
        <button className="rounded-full px-4 py-2 text-sm font-semibold btn-brand">Add expense</button>
      </form>

      {/* By category */}
      {byCat.size > 0 && (
        <div className="flex flex-wrap gap-2 text-sm">
          {[...byCat.entries()].map(([c, amt]) => (
            <span key={c} className="rounded-full bg-cream px-3 py-1">{c}: <span className="font-semibold">{formatPeso(amt)}</span></span>
          ))}
          <span className="rounded-full bg-plum-ink px-3 py-1 font-semibold text-white">Total: {formatPeso(total)}</span>
        </div>
      )}

      {/* List */}
      <div className="overflow-x-auto rounded-tile border border-plum-ink/10 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="text-plum-ink/50"><tr><th className="p-3">Date</th><th>Category</th><th>Note</th><th className="text-right">Amount</th><th></th></tr></thead>
          <tbody>
            {expenses.length === 0 && <tr><td className="p-3 text-plum-ink/40" colSpan={5}>No expenses recorded.</td></tr>}
            {expenses.map((e) => (
              <tr key={e.id} className="border-t border-plum-ink/10">
                <td className="p-3">{manilaDate(e.date)}</td>
                <td>{e.category}</td>
                <td className="text-plum-ink/60">{e.note ?? "—"}</td>
                <td className="text-right font-semibold">{formatPeso(e.amount)}</td>
                <td className="pr-3 text-right">
                  <form action={deleteExpense}>
                    <input type="hidden" name="id" value={e.id} />
                    <button className="text-xs text-muted hover:text-guava">Delete</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
