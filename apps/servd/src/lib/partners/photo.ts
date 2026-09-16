/**
 * Shrink a photo in the phone, before it goes anywhere.
 *
 * THIS IS WHAT MAKES A REQUIRED PHOTO COMPATIBLE WITH WORKING OFFLINE. The
 * visit queue originally refused to hold photos because "a few megabytes of
 * base64 per item fills a phone's storage" — true of what a modern camera
 * produces, which is 3–8 MB. At 1024px and quality 0.7 the same photo is around
 * 100 KB, so ten queued visits cost about a megabyte and the objection goes
 * away.
 *
 * It is also the difference between a salesperson in a dead zone recording
 * their work and losing it.
 *
 * WHAT IS DELIBERATELY NOT DONE: no upscaling (a small photo stays small), and
 * no stripping of the image beyond what the canvas re-encode already does.
 * EXIF — including any GPS the camera wrote — does not survive a canvas
 * re-encode, which is a privacy improvement we get for free: the location we
 * keep is the one the person consented to send, not one their camera embedded.
 */

/** Wide enough to recognise a shopfront and a face. */
const MAX_EDGE = 1024;
const QUALITY = 0.7;

/** Refuse anything that is not an image before touching the camera pipeline. */
export function isImage(file: File): boolean {
  return file.type.startsWith("image/");
}

export interface ShrunkPhoto {
  /** `data:image/jpeg;base64,…` — what the server accepts. */
  dataUrl: string;
  /** Rough byte count after base64, for a size guard. */
  bytes: number;
}

/**
 * True for a format an iPhone writes but a desktop browser cannot decode.
 *
 * HEIC is the DEFAULT on every current iPhone. Photos sent to a phone or picked
 * by the camera are converted on the way out, so the field path is unaffected —
 * but a manager testing this on a laptop, from a photo they AirDropped or
 * emailed to themselves, hands the browser a raw .heic. Chrome and Firefox
 * decode none of it. Naming it is the difference between "try again" (which
 * fails identically, forever) and knowing to export a JPEG.
 */
function isUndecodableHeic(file: File): boolean {
  return /heic|heif/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

export async function shrinkPhoto(file: File): Promise<ShrunkPhoto> {
  if (!isImage(file) && !isUndecodableHeic(file)) {
    throw new Error("That file isn't a photo.");
  }

  let bitmap: ImageBitmap | HTMLImageElement;
  try {
    bitmap = await loadBitmap(file);
  } catch (err) {
    // Safari decodes HEIC and will not land here; Chrome and Firefox will.
    if (isUndecodableHeic(file)) {
      throw new Error(
        "This browser can't open iPhone HEIC photos. Take the photo in the app, or save it as JPEG first.",
      );
    }
    throw err;
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process that photo.");
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, w, h);
  if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();

  // JPEG, not PNG: a photograph as PNG is roughly ten times the size for no
  // visible gain.
  const dataUrl = canvas.toDataURL("image/jpeg", QUALITY);
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return { dataUrl, bytes: Math.round((base64.length * 3) / 4) };
}

/**
 * `createImageBitmap` where it exists, an <img> elsewhere.
 *
 * Safari only gained `createImageBitmap` for blobs in 15, and a field phone is
 * exactly the device most likely to be old.
 */
async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fall through to the <img> path */
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that photo."));
    };
    img.src = url;
  });
}
