"use client";

/**
 * Downloads a single table's QR as an SVG file (crisp at any size). The SVG is
 * generated server-side by us, so it's safe to hand to the browser as a blob.
 */
export function QrDownloadButton({ svg, filename }: { svg: string; filename: string }) {
  function download() {
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      onClick={download}
      className="rounded-lg border border-plum-ink/15 px-3 py-1.5 text-xs font-semibold"
    >
      Download QR
    </button>
  );
}
