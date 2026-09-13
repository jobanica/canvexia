"use client";

/** Triggers the browser/OS print dialog. Hidden in the printed output itself. */
export function PrintButton({
  children = "Print",
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      onClick={() => window.print()}
      className={`rounded-full px-5 py-2 text-sm font-semibold btn-brand print:hidden ${className}`}
    >
      {children}
    </button>
  );
}
