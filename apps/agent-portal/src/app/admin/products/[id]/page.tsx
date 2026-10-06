import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/admin-page";
import { staffDb } from "@/server/scoped-db";
import { ActionForm, Field, inputClass } from "@/components/ActionForm";
import { Badge, tdClass, thClass } from "@/components/AdminShell";
import { peso } from "@/lib/money";
import { manilaDate, manilaDateTime, manilaIsoDate } from "@/lib/time";
import { addRuleAction, rotateSecretAction, updateProductAction } from "../actions";

export default async function ProductDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  const product = await staffDb("admin", (tx) =>
    tx.agentProduct.findUnique({
      where: { id },
      include: {
        credential: { select: { secretHint: true, rotatedAt: true } },
        rules: { orderBy: [{ plan: "asc" }, { validFrom: "desc" }], include: { _count: { select: { referrals: true } } } },
      },
    }),
  ).catch(() => null);
  if (!product) notFound();
  const now = new Date();

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">
        {product.name} <span className="font-mono text-base text-slate-500">{product.slug}</span>
      </h1>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 font-semibold">Details</h2>
          <ActionForm action={updateProductAction} submitLabel="Save">
            <input type="hidden" name="productId" value={product.id} />
            <input type="hidden" name="slug" value={product.slug} />
            <Field label="Name"><input name="name" defaultValue={product.name} required className={inputClass} /></Field>
            <Field label="Signup URL"><input name="signupUrl" type="url" defaultValue={product.signupUrl ?? ""} className={inputClass} /></Field>
            <Field label="Callback URL"><input name="callbackUrl" type="url" defaultValue={product.callbackUrl ?? ""} className={inputClass} /></Field>
            <Field label="Status" hint="An inactive product's requests are refused.">
              <select name="status" defaultValue={product.status} className={inputClass}>
                <option value="active">active</option>
                <option value="inactive">inactive</option>
              </select>
            </Field>
          </ActionForm>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-1 font-semibold">API secret</h2>
          <p className="mb-3 text-sm text-slate-600">
            {product.credential
              ? <>Ends in <code className="font-mono">…{product.credential.secretHint}</code>, issued {manilaDateTime(product.credential.rotatedAt)}.</>
              : "No secret issued."}
          </p>
          <ActionForm
            action={rotateSecretAction}
            submitLabel={product.credential ? "Issue a new secret" : "Issue a secret"}
            danger={!!product.credential}
            confirm={product.credential ? "The current secret stops working immediately. Continue?" : undefined}
          >
            <input type="hidden" name="productId" value={product.id} />
          </ActionForm>
        </section>
      </div>

      <section>
        <h2 className="font-semibold">Commission rules</h2>
        <p className="mt-1 text-sm text-slate-600">
          Each customer keeps the rule in force when they signed up. To change prices or commission,
          add a new rule starting on a later date — the current one closes that day.
        </p>
        <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200">
              <tr>
                {["Plan", "Activation fee", "Monthly fee", "Activation commission", "Tier 1", "Tier 2", "Valid", "Customers"].map((h) => (
                  <th key={h} className={thClass}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {product.rules.map((r) => {
                const current = r.validFrom <= now && (!r.validTo || now < r.validTo);
                return (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0">
                    <td className={tdClass}>{r.plan ?? <span className="text-slate-500">all plans</span>}</td>
                    <td className={tdClass}>{peso(r.activationFee)}</td>
                    <td className={tdClass}>{peso(r.monthlyFee)}</td>
                    <td className={tdClass}>{peso(r.activationCommission)}</td>
                    <td className={tdClass}>{peso(r.tier1Amount)} × {r.tier1Months} paid months</td>
                    <td className={tdClass}>{peso(r.tier2Amount)} after</td>
                    <td className={tdClass}>
                      {manilaDate(r.validFrom)} – {r.validTo ? manilaDate(r.validTo) : "open"}{" "}
                      {current && <Badge tone="green">current</Badge>}
                    </td>
                    <td className={tdClass}>{r._count.referrals}</td>
                  </tr>
                );
              })}
              {product.rules.length === 0 && (
                <tr><td className={tdClass} colSpan={8}>No rules. Customers signing up now get no rule and cannot be confirmed.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 max-w-2xl rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-3 font-semibold">Add a rule</h3>
          <ActionForm action={addRuleAction} submitLabel="Add rule">
            <input type="hidden" name="productId" value={product.id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Plan" hint="Blank = every plan without its own rule."><input name="plan" className={inputClass} /></Field>
              <Field label="Starts (Manila date)"><input name="validFrom" type="date" required defaultValue={manilaIsoDate(now)} className={inputClass} /></Field>
              <Field label="Activation fee (₱)"><input name="activationFee" required inputMode="decimal" defaultValue="500" className={inputClass} /></Field>
              <Field label="Monthly fee (₱)"><input name="monthlyFee" required inputMode="decimal" defaultValue="800" className={inputClass} /></Field>
              <Field label="Activation commission (₱)"><input name="activationCommission" required inputMode="decimal" defaultValue="500" className={inputClass} /></Field>
              <Field label="Tier 1 commission per paid month (₱)"><input name="tier1Amount" required inputMode="decimal" defaultValue="200" className={inputClass} /></Field>
              <Field label="Tier 1 lasts (paid months)"><input name="tier1Months" type="number" min={0} required defaultValue={6} className={inputClass} /></Field>
              <Field label="Tier 2 commission per paid month after (₱)"><input name="tier2Amount" required inputMode="decimal" defaultValue="100" className={inputClass} /></Field>
            </div>
          </ActionForm>
        </div>
      </section>
    </div>
  );
}
