import type { CreditNoteDocument } from "@/lib/pharmacy/credit-note";
import { peso, manilaDateTime, manilaExpiry } from "@/lib/money";

/**
 * The credit note, on paper.
 *
 * Same 80mm column and the same rules as ReceiptPaper — hairlines, no fills,
 * every figure from a tested module. The one structural difference is the
 * CORRECTS block: a credit note that does not name the receipt it reverses is
 * not reconcilable, so it sits directly under the title rather than in a
 * footnote.
 */

const REFUND_LABEL: Record<string, string> = {
  cash: "Cash",
  gcash: "GCash",
  maya: "Maya",
  card: "Card",
  store_credit: "Store credit",
};

const DISPOSITION_LABEL: Record<string, string> = {
  restocked: "returned to stock",
  destroyed: "written off, not resaleable",
};

function Rule() {
  return <div className="my-2 border-t border-dashed border-black/40" />;
}

export function CreditNotePaper({ doc }: { doc: CreditNoteDocument }) {
  const { identity } = doc;

  return (
    <article
      data-receipt-paper
      className="mx-auto w-full max-w-[302px] bg-white p-3 font-mono text-[11px] leading-snug text-black"
    >
      <header className="text-center">
        <h1 className="text-[13px] font-bold uppercase tracking-wide">{doc.title}</h1>
        {identity.address && <p>{identity.address}</p>}
        {identity.phone && <p>Tel {identity.phone}</p>}
        {identity.tin && (
          <p>
            {doc.vatRegistered ? "VAT REG TIN" : "NON-VAT TIN"} {identity.tin}
          </p>
        )}
        {identity.fdaLtoNumber && <p>FDA LTO {identity.fdaLtoNumber}</p>}
        {identity.prcLicenseNo && <p>PRC Lic. No. {identity.prcLicenseNo}</p>}
      </header>

      {!doc.isOfficial && (
        <div className="my-2 border-2 border-black p-2 text-center">
          <p className="text-[12px] font-bold">NOT AN OFFICIAL CREDIT NOTE</p>
          <p className="mt-1 text-[10px]">
            Missing: {doc.gaps.map((g) => g.label).join(", ")}
          </p>
        </div>
      )}

      <Rule />

      <div className="text-center">
        <p className="font-bold uppercase tracking-wide">Credit Note</p>
        <p>No. {doc.returnNumber}</p>
        <p>{manilaDateTime(doc.issuedAt)}</p>
      </div>

      <Rule />

      {/* The reference that makes this document mean anything. */}
      <div className="space-y-0.5">
        <p className="font-bold">Corrects invoice</p>
        <p>No. {doc.correcting.receiptNumber}</p>
        <p>issued {manilaDateTime(doc.correcting.issuedAt)}</p>
      </div>

      <Rule />

      <ul className="space-y-2">
        {doc.lines.map((line, i) => (
          <li key={i}>
            <p className="font-bold">{line.productName}</p>
            {line.generic && <p className="pl-2">{line.generic}</p>}
            <p className="pl-2">
              {line.lotNumber ? `Lot ${line.lotNumber}` : "No lot"}
              {line.expiry && ` · exp ${manilaExpiry(line.expiry)}`}
            </p>
            <div className="flex justify-between gap-3 pl-2">
              <span>
                {line.quantity} × {peso(line.unitPriceCentavos)}
              </span>
              <span className="tabular-nums">{peso(line.lineTotalCentavos)}</span>
            </div>
            {/* What became of the goods. An inspection asks; a shop floor forgets. */}
            <p className="pl-2 text-[10px]">
              {DISPOSITION_LABEL[line.disposition] ?? line.disposition}
            </p>
          </li>
        ))}
      </ul>

      <Rule />

      <div className="space-y-0.5">
        {doc.summary.map((row, i) => (
          <div key={i}>
            <div className={`flex justify-between gap-3 ${row.kind === "due" ? "font-bold" : ""}`}>
              <span>{row.label}</span>
              <span className="tabular-nums">
                {row.kind === "deduction" ? `−${peso(row.centavos)}` : peso(row.centavos)}
              </span>
            </div>
            {row.note && <p className="text-[10px]">{row.note}</p>}
          </div>
        ))}
      </div>

      {doc.vat && (
        <>
          <Rule />
          <div className="space-y-0.5">
            <div className="flex justify-between gap-3">
              <span>VATable</span>
              <span className="tabular-nums">{peso(doc.vat.vatableSalesCentavos)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>VAT ({identity.vatRatePct}%)</span>
              <span className="tabular-nums">{peso(doc.vat.vatCentavos)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>VAT-exempt</span>
              <span className="tabular-nums">{peso(doc.vat.vatExemptCentavos)}</span>
            </div>
          </div>
        </>
      )}

      <Rule />

      <div className="space-y-0.5">
        <p>Refunded by {REFUND_LABEL[doc.refundMethod] ?? doc.refundMethod}</p>
        {doc.reason && <p>Reason: {doc.reason}</p>}
      </div>

      {doc.beneficiary && (
        <>
          <Rule />
          <div className="space-y-1">
            <p className="font-bold uppercase">{doc.beneficiary.label}</p>
            <p>Name: {doc.beneficiary.name ?? "________________"}</p>
            <p>ID No: {doc.beneficiary.idNo ?? "________________"}</p>
          </div>
        </>
      )}

      <Rule />

      <footer className="space-y-1">
        {doc.processedBy && <p className="text-center">Processed by {doc.processedBy}</p>}
        {/* Two signatures: the customer acknowledges the money, the pharmacy
            acknowledges the goods. Neither can be captured on a screen. */}
        <p className="pt-4">Received by: ________________</p>
        <p className="pt-3">Approved by: ________________</p>
      </footer>
    </article>
  );
}
