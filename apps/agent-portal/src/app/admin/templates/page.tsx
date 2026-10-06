import Link from "next/link";
import { requireAdminPage } from "@/lib/admin-page";
import { staffDb } from "@/server/scoped-db";
import { ActionForm, Field, inputClass } from "@/components/ActionForm";
import { Badge } from "@/components/AdminShell";
import { PLACEHOLDERS } from "@/lib/contract";
import { manilaDateTime } from "@/lib/time";
import { publishTemplateAction } from "./actions";

/**
 * A starting point, NOT legal text: it is here so the placeholders are
 * visible. Have the agreement reviewed before customers sign it.
 */
const STARTER = `DRAFT — replace with reviewed legal text before use.

This Subscription Agreement is between CANVEXIA and {{business_name}}, represented by {{owner_name}}, for {{product_name}} ({{plan}} plan).

1. Fees. A one-time activation fee of {{activation_fee}} and a monthly fee of {{monthly_fee}}, paid by bank or e-wallet transfer to CANVEXIA's company account.

2. Term. The minimum term is {{minimum_term_months}} months from the date of signing, then month to month.

3. Payment. Payment is confirmed when CANVEXIA verifies the uploaded receipt. CANVEXIA's agents never collect payments.

Date: {{date}}`;

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
  await requireAdminPage();
  const { product } = await searchParams;
  const { products, templates } = await staffDb("admin", async (tx) => ({
    products: await tx.agentProduct.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    templates: await tx.agentContractTemplate.findMany({
      where: { kind: "customer", productId: product || null },
      orderBy: { version: "desc" },
    }),
  }));
  const active = templates.find((t) => t.active);
  const scope = products.find((p) => p.id === product)?.name ?? "All products (global)";

  return (
    <div className="max-w-3xl space-y-5">
      <h1 className="text-xl font-semibold">Contract templates</h1>
      <p className="text-sm text-slate-600">
        The subscription agreement a customer signs before activation. A product uses its own template
        if it has one, otherwise the global one. Publishing creates a new version; signed contracts keep
        the version they signed.
      </p>
      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/admin/templates" className={!product ? "font-semibold" : "text-slate-600"}>Global</Link>
        {products.map((p) => (
          <Link key={p.id} href={`/admin/templates?product=${p.id}`} className={product === p.id ? "font-semibold" : "text-slate-600"}>{p.name}</Link>
        ))}
      </div>
      <p className="text-xs text-slate-500">
        Placeholders: {PLACEHOLDERS.map((k) => `{{${k}}}`).join(" ")}
      </p>
      <ActionForm action={publishTemplateAction} submitLabel={`Publish for ${scope}`} confirm="Publish this as the new agreement?">
        <input type="hidden" name="productId" value={product ?? ""} />
        <Field label={`Agreement — ${scope}`}>
          <textarea name="body" rows={18} defaultValue={active?.body ?? STARTER} className={`${inputClass} font-mono`} />
        </Field>
      </ActionForm>
      <ul className="space-y-1 text-sm">
        {templates.map((t) => (
          <li key={t.id}>Version {t.version} · {manilaDateTime(t.createdAt)} {t.active && <Badge tone="green">active</Badge>}</li>
        ))}
      </ul>
    </div>
  );
}
