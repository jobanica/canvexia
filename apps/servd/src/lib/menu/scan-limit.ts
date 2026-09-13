/**
 * How many files one menu scan is allowed to send to the AI.
 *
 * Each file is a vision call, so the count is what the scan costs. The
 * super-admin building storefronts in-house can spend four on a long menu;
 * a partner account gets one, because partners are unlimited and their scans
 * are billed to us, not to them.
 *
 * Over the limit is an ERROR, never a silent trim: quietly dropping pages 2-4
 * returns a half-read menu that looks like the AI simply missed things, and the
 * partner re-scans — spending more than the cap was meant to save.
 */

/** Files a partner may scan at once. */
export const PARTNER_SCAN_LIMIT = 1;
/** Files the super-admin may scan at once. */
export const ADMIN_SCAN_LIMIT = 4;

export type ScanFileCheck<T> = { ok: true; files: T[] } | { ok: false; error: string };

/**
 * Keep only files with actual bytes, then hold the caller to `max`.
 * Generic over the file type so it stays testable without a DOM File.
 */
export function limitScanFiles<T extends { size: number }>(
  files: T[],
  max: number,
): ScanFileCheck<T> {
  const usable = files.filter((f) => f && f.size > 0);
  if (usable.length === 0) {
    return { ok: false, error: "Choose at least one menu photo or PDF to scan." };
  }
  if (usable.length > max) {
    return {
      ok: false,
      error:
        max === 1
          ? "One photo per scan. Pick the single clearest photo of the menu — you can scan again to add more."
          : `Up to ${max} files per scan — you picked ${usable.length}.`,
    };
  }
  return { ok: true, files: usable };
}
