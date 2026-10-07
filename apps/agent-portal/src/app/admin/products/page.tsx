import Link from "next/link";
import { requireAdminPage } from "@/lib/admin-page";
import { staffDb } from "@/server/scoped-db";
import { ActionForm, Field, inputClass } from "@/components/ActionForm";
import { Badge, tdClass, thClass } from "@/components/AdminShell";
import { createProductAction } from "./actions";

export default async function ProductsPage() {
  await requireAdminPage();
  const products = await staffDb("admin", (tx) =>
    tx.agentProduct.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { referrals: true } } },
    }),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Products</h1>
        <p className="mt-1 text-sm text-slate-600">
          A product reports to the portal with its slug and API secret. Adding one needs no code here —
          only the connection kit in the product.
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200">
            <tr>
              <th className={thClass}>Name</th>
              <th className={thClass}>Slug</th>
              <th className={thClass}>Customers</th>
              <th className={thClass}>Status</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-b border-slate-100 last:border-0">
                <td className={tdClass}><Link href={`/admin/products/${p.id}`} className="font-medium underline">{p.name}</Link></td>
                <td className={`${tdClass} font-mono`}>{p.slug}</td>
                <td className={tdClass}>{p._count.referrals}</td>
                <td className={tdClass}><Badge tone={p.status === "active" ? "green" : "slate"}>{p.status}</Badge></td>
              </tr>
            ))}
            {products.length === 0 && <tr><td className={tdClass} colSpan={4}>No products yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <section className="max-w-lg rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 font-semibold">Add a product</h2>
        <ActionForm action={createProductAction} submitLabel="Create product">
          <Field label="Name"><input name="name" required className={inputClass} placeholder="Servd" /></Field>
          <Field label="Slug" hint="Sent by the product in every request. Cannot be changed later.">
            <input name="slug" required className={inputClass} placeholder="servd" />
          </Field>
          <Field label="Signup URL" hint="Agents' links are this URL with ?ref=CODE.">
            <input name="signupUrl" type="url" className={inputClass} placeholder="https://www.servdph.net/signup" />
          </Field>
          <Field label="Callback URL" hint="Where the portal sends payment and contract outcomes.">
            <input name="callbackUrl" type="url" className={inputClass} />
          </Field>
        </ActionForm>
      </section>
    </div>
  );
}
