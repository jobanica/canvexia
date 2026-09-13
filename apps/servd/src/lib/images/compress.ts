/**
 * Shrink a photo in the browser before it is uploaded.
 *
 * This is not an optimisation, it is a correctness fix. A menu photo used to be
 * posted at whatever size the phone's camera produced, and a Server Action's
 * request body is capped by the hosting platform at ~4.5 MB — BELOW the 5 MB
 * the app itself allowed. A 5 MB photo was therefore rejected before any of our
 * code ran, so the action could not return a friendly error: the POST simply
 * failed and the page white-screened.
 *
 * Compressing first means a 12 MP camera photo arrives as a few hundred
 * kilobytes, comfortably under every limit, and the menu loads faster for
 * diners afterwards.
 *
 * The maths is separated from the canvas work so the sizing rules can be tested
 * without a browser.
 */

/** Longest edge we keep. Well beyond what a menu card or a receipt needs. */
export const DEFAULT_MAX_DIM = 1600;
/** Aim below this; the platform's real ceiling is ~4.5 MB. */
export const DEFAULT_TARGET_BYTES = 900 * 1024;
/** Refuse anything above this even uncompressed — see HARD_LIMIT_MESSAGE. */
export const HARD_MAX_BYTES = 4 * 1024 * 1024;

export const HARD_LIMIT_MESSAGE =
  "That photo is too large to upload. Please pick a smaller one, or take a new photo.";

/** Scale a photo down to fit `maxDim` on its longest edge. Never scales up. */
export function fitWithin(
  width: number,
  height: number,
  maxDim = DEFAULT_MAX_DIM,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxDim || longest === 0) {
    return { width: Math.round(width), height: Math.round(height) };
  }
  const scale = maxDim / longest;
  // At least 1px each way — a 0-height canvas throws.
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Whether a file can be sent as-is. A small JPEG/PNG/WebP is already fine, and
 * re-encoding it would only lose quality for nothing.
 */
export function needsCompression(
  size: number,
  type: string,
  targetBytes = DEFAULT_TARGET_BYTES,
): boolean {
  const safeType = /^image\/(jpeg|png|webp)$/i.test(type);
  return !safeType || size > targetBytes;
}

/** Quality steps tried in order until the result fits the target. */
export const QUALITY_STEPS = [0.82, 0.7, 0.6, 0.5] as const;

export interface CompressResult {
  file: File;
  /** False when the original was already small enough and was passed through. */
  compressed: boolean;
  originalBytes: number;
  bytes: number;
}

/**
 * Compress in the browser. Throws with a readable message when the image can't
 * be decoded at all — an iPhone HEIC that slipped past the file picker's accept
 * filter, for instance, which a canvas cannot read.
 */
export async function compressImageFile(
  file: File,
  {
    maxDim = DEFAULT_MAX_DIM,
    targetBytes = DEFAULT_TARGET_BYTES,
  }: { maxDim?: number; targetBytes?: number } = {},
): Promise<CompressResult> {
  const originalBytes = file.size;

  if (!needsCompression(file.size, file.type, targetBytes)) {
    return { file, compressed: false, originalBytes, bytes: file.size };
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(
      "We couldn't read that image. Please use a JPG or PNG — some phone photo formats (like HEIC) aren't supported.",
    );
  }

  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, maxDim);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(bitmap, 0, 0, width, height);

    for (const quality of QUALITY_STEPS) {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", quality),
      );
      if (!blob) continue;
      if (blob.size <= targetBytes || quality === QUALITY_STEPS[QUALITY_STEPS.length - 1]) {
        const out = new File([blob], jpegName(file.name), {
          type: "image/jpeg",
          lastModified: Date.now(),
        });
        // A pathological source can still come out bigger than it went in.
        // Keep whichever is smaller.
        return out.size < originalBytes
          ? { file: out, compressed: true, originalBytes, bytes: out.size }
          : { file, compressed: false, originalBytes, bytes: originalBytes };
      }
    }
    return { file, compressed: false, originalBytes, bytes: originalBytes };
  } finally {
    bitmap.close?.();
  }
}

/** "IMG_0421.HEIC" → "IMG_0421.jpg" */
export function jpegName(name: string): string {
  const base = name.replace(/\.[^./\\]+$/, "") || "photo";
  return `${base}.jpg`;
}

/**
 * Swap the chosen file on a real <input type="file"> for the compressed one, so
 * the surrounding form submits the smaller image with no other changes.
 *
 * Returns false where DataTransfer isn't available; the caller then leaves the
 * original in place rather than silently dropping the photo.
 */
export function replaceInputFile(input: HTMLInputElement, file: File): boolean {
  try {
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    return true;
  } catch {
    return false;
  }
}
