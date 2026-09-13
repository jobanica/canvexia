import { redirect } from "next/navigation";
import { getShiftReport } from "@/server/printing/shift-report";
import { AutoPrint } from "@/components/cashier/AutoPrint";

/**
 * The end-of-shift report as a printable page.
 *
 * This is the FALLBACK, not the main path: the Print button in the cashier now
 * sends the report straight to the receipt printer over whichever transport the
 * restaurant uses. This page is what opens when that transport is the OS print
 * dialog (AirPrint, a desktop printer), and it's also handy for a screenshot.
 *
 * It renders exactly the lines that get sent to the thermal printer — same
 * builder, same 32-column layout — so the paper and the screen can never
 * disagree about a total.
 */
export default async function ShiftSummaryPrintPage() {
  const bundle = await getShiftReport();
  if (!bundle) redirect("/cashier");
  const { report } = bundle;

  return (
    <div className="mx-auto max-w-[320px] bg-white p-4 font-mono text-[13px] leading-snug text-black">
      <AutoPrint />
      <div className="text-center">
        {report.headerLines.map((line, i) => (
          <p key={i} className={i === 0 ? "font-bold" : "text-xs"}>
            {line}
          </p>
        ))}
        <p className="mt-1 text-base font-extrabold tracking-wide">SHIFT SUMMARY</p>
      </div>

      {/* `whitespace-pre` keeps the column alignment the report already
          computed — re-flowing it here would undo the padding. */}
      <pre className="mt-2 whitespace-pre font-mono text-[13px] leading-snug">
        {report.bodyLines.join("\n")}
      </pre>

      {report.footerLines.length > 0 && (
        <div className="mt-3 text-center">
          {report.footerLines.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      )}
    </div>
  );
}
