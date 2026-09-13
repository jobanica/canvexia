"use client";

import { compressImageFile } from "./compress";

/**
 * Turn a customer's payment screenshot into something we can send.
 *
 * The old version did this inline with createImageBitmap and, on any failure,
 * quietly set the receipt to null. That is worse than it sounds: the customer
 * taps upload, nothing visibly happens, they carry on and place the order — and
 * the cashier is left staring at "GCash · verify first" with nothing to verify.
 * Neither of them ever finds out why. iPhones are the common trigger, because
 * HEIC is their default camera format and browsers won't always decode it.
 *
 * So there are two paths and a real error. Compress if the browser can decode
 * the image; otherwise send the original bytes, which the server can still
 * store and the cashier can still look at. Only give up when the file is too
 * big to send at all, and say so when we do.
 */

/**
 * Below the platform's ~4.5 MB request-body cap, with room for base64's 33%
 * inflation and the rest of the order payload. A receipt over this never
 * reaches the server, so it has to be caught in the browser where we can
 * actually tell the customer.
 */
const MAX_DATA_URL_BYTES = 3 * 1024 * 1024;

export interface ReceiptResult {
  /** Data URL to send with the order, or null when it couldn't be prepared. */
  dataUrl: string | null;
  /** Customer-facing reason. Null when it worked. */
  error: string | null;
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

export async function prepareReceipt(file: File): Promise<ReceiptResult> {
  if (!file.type.startsWith("image/")) {
    return { dataUrl: null, error: "That's not an image — please pick a screenshot or photo." };
  }

  // Preferred path: shrink it. Same helper the menu photos use, so a fix to
  // one is a fix to both.
  let candidate: Blob = file;
  try {
    const { file: compressed } = await compressImageFile(file);
    candidate = compressed;
  } catch {
    // Browser couldn't decode it (HEIC is the usual reason). The original
    // bytes are still a perfectly good receipt — send them as they are.
    candidate = file;
  }

  if (candidate.size > MAX_DATA_URL_BYTES) {
    return {
      dataUrl: null,
      error: "That image is too large to send. Please take a screenshot instead of a photo.",
    };
  }

  try {
    return { dataUrl: await readAsDataUrl(candidate), error: null };
  } catch {
    return { dataUrl: null, error: "Couldn't read that file. Please try another screenshot." };
  }
}
