import "server-only";

import { systemDb } from "@/server/tenancy/scoped-db";
import { pesosToCentavos } from "@/lib/money";
import { uploadMenuImage, uploadMenuImageBytes } from "@/server/storage/menu-images";
import { ALLOWED_MENU_DOC_TYPES } from "@/lib/validation/menu";
import { limitScanFiles, ADMIN_SCAN_LIMIT } from "@/lib/menu/scan-limit";
import { scanMenuMedia } from "./ai-scan";

export type ScanResult = { ok: true; added: number } | { ok: false; error: string };

/**
 * Upload menu photo(s)/PDF, let Claude read them, and append the detected
 * categories + items to a demo storefront's menu. No auth here — the caller is
 * responsible for authorizing access to `restaurantId`.
 *
 * `maxFiles` is what the scan is allowed to cost: one vision call per file.
 * The partner portal passes 1; the super-admin screen keeps the old 4.
 */
export async function scanAndSaveMenu(
  restaurantId: string,
  files: File[],
  maxFiles: number = ADMIN_SCAN_LIMIT,
): Promise<ScanResult> {
  const checked = limitScanFiles(
    files.filter((f) => f instanceof File),
    maxFiles,
  );
  if (!checked.ok) return { ok: false, error: checked.error };

  const media: { url: string; pdf: boolean }[] = [];
  try {
    for (const f of checked.files) {
      if (!ALLOWED_MENU_DOC_TYPES.includes(f.type as never)) {
        return { ok: false, error: "Use JPEG / PNG / WebP photos or a PDF." };
      }
      if (f.type === "application/pdf") {
        const bytes = new Uint8Array(await f.arrayBuffer());
        const url = await uploadMenuImageBytes(restaurantId, bytes, "pdf", "application/pdf");
        media.push({ url, pdf: true });
      } else {
        const url = await uploadMenuImage(restaurantId, f);
        media.push({ url, pdf: false });
      }
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't upload the file." };
  }

  const res = await scanMenuMedia(media);
  if (!res.ok) return { ok: false, error: res.error };

  let added = 0;
  try {
    await systemDb(async (tx) => {
      for (const c of res.categories) {
        const cat = await tx.category.create({
          data: { restaurantId, name: c.name.slice(0, 80) },
          select: { id: true },
        });
        for (const it of c.items) {
          await tx.menuItem.create({
            data: {
              restaurantId,
              categoryId: cat.id,
              name: it.name.slice(0, 120),
              description: it.description || null,
              price: pesosToCentavos(it.price),
            },
            select: { id: true },
          });
          added++;
        }
      }
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't save the scanned menu." };
  }
  return { ok: true, added };
}
