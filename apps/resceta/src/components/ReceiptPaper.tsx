import type { ReceiptDocument } from "@/lib/pharmacy/receipt";
import { peso, manilaDateTime, manilaExpiry } from "@/lib/money";

/**
 * The receipt, on paper.
 *
 * Laid out for 80mm thermal roll — one narrow column, monospace, no colour, no
 * background fills. Thermal printers render a grey box as a solid black smear
 * and every peso of that ink comes off the roll, so the only rules here are
 * hairlines and the only emphasis is weight.
 *
 * Every figure comes from `buildReceipt`, which is tested. This file decides
 * nothing about money; if a number looks wrong the bug is in the lib.
 */

const PAYMENT_LABEL: Record<string, string> = {
  cash: "Cash",
  gcash: "GCash",
  maya: "Maya",
  card: "Card",
};

function Rule() {
  return <div className="my-2 border-t border-dashed border-black/40" />;
}

function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className={`flex justify-between gap-3 ${bold ? "font-bold" : ""}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

export function ReceiptPaper({ doc }: { doc: ReceiptDocument }) {
  const { identity } = doc;

  return (
    <article
      data-receipt-paper
      className="mx-auto w-full max-w-[302px] bg-white p-3 font-mono text-[11px] leading-snug text-black">
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

      {doc.voided && (
        <p className="my-2 border-2 border-black py-1 text-center text-[15px] font-bold tracking-[0.3em]">
          VOID
        </p>
      )}

      {!doc.isOfficial && (
        // Printed blanks would still look like an official receipt, and the
        // customer cannot tell. Saying so is the honest failure.
        <div className="my-2 border-2 border-black p-2 text-center">
          <p className="text-[12px] font-bold">NOT AN OFFICIAL RECEIPT</p>
          <p className="mt-1 text-[10px]">
            Missing: {doc.gaps.map((g) => g.label).join(", ")}
          </p>
        </div>
      )}

      <Rule />

      <div className="text-center">
        <p className="font-bold uppercase tracking-wide">Sales Invoice</p>
        <p>No. {doc.receiptNumber}</p>
        <p>{manilaDateTime(doc.issuedAt)}</p>
      </div>

      <Rule />

      <ul className="space-y-2">
        {doc.lines.map((line, i) => (
          <li key={i}>
            <p className="font-bold">{line.nameAtTime}</p>
            {line.genericAtTime && <p className="pl-2">{line.genericAtTime}</p>}
            {(line.lotNumberAtTime || line.expiryAtTime) && (
              // The recall trail, and for many customers the receipt is the
              // only copy of it that leaves the building.
              <p className="pl-2">
                {line.lotNumberAtTime ? `Lot ${line.lotNumberAtTime}` : "No lot"}
                {line.expiryAtTime && ` · exp ${manilaExpiry(line.expiryAtTime)}`}
              </p>
            )}
            <div className="flex justify-between gap-3 pl-2">
              <span>
                {line.quantity} × {peso(line.unitPriceCentavos)}
              </span>
              <span className="tabular-nums">{peso(line.lineTotalCentavos)}</span>
            </div>
          </li>
        ))}
      </ul>

      <Rule />

      <div className="space-y-0.5">
        {doc.summary.map((row, i) => (
          <Row
            key={i}
            label={row.label}
            value={row.kind === "deduction" ? `−${peso(row.centavos)}` : peso(row.centavos)}
            bold={row.kind === "due"}
          />
        ))}
      </div>

      {doc.vat && (
        <>
          <Rule />
          <div className="space-y-0.5">
            <Row label="VATable sales" value={peso(doc.vat.vatableSalesCentavos)} />
            <Row
              label={`VAT (${identity.vatRatePct}%)`}
              value={peso(doc.vat.vatCentavos)}
            />
            <Row label="VAT-exempt sales" value={peso(doc.vat.vatExemptCentavos)} />
            <Row label="Zero-rated sales" value={peso(doc.vat.zeroRatedCentavos)} />
          </div>
        </>
      )}

      <Rule />

      <div className="space-y-0.5">
        <Row
          label={PAYMENT_LABEL[doc.payment.method] ?? doc.payment.method}
          value={peso(doc.payment.tenderedCentavos)}
        />
        <Row label="Change" value={peso(doc.payment.changeCentavos)} />
      </div>

      {doc.beneficiary && (
        <>
          <Rule />
          <div className="space-y-1">
            <p className="font-bold uppercase">{doc.beneficiary.label}</p>
            <p>Name: {doc.beneficiary.name ?? "________________"}</p>
            <p>ID No: {doc.beneficiary.idNo ?? "________________"}</p>
            {/* The signature is a statutory part of the discount record, and
                it cannot be captured on a screen — so the paper leaves room. */}
            <p className="pt-3">Signature: ________________</p>
          </div>
        </>
      )}

      {doc.prescriptionRef && (
        <>
          <Rule />
          <p>Rx: {doc.prescriptionRef}</p>
        </>
      )}

      <Rule />

      <footer className="space-y-1 text-center">
        {doc.soldBy && <p>Dispensed by {doc.soldBy}</p>}
        {identity.prcLicenseNo && (
          <p>Under the supervision of a registered pharmacist</p>
        )}
        {!doc.vatRegistered && (
          <p className="font-bold">THIS DOCUMENT IS NOT VALID FOR CLAIM OF INPUT TAX</p>
        )}
        <p className="pt-2">
          {doc.isOfficial
            ? "THIS SERVES AS YOUR OFFICIAL RECEIPT"
            : "Not valid for claiming a discount or input tax"}
        </p>
      </footer>
    </article>
  );
}
