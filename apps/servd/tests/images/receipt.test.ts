import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The bug this guards, in the cashier's words: "GCash · verify first" with
 * nothing to verify. The old picker caught every failure and set the receipt to
 * null, so a customer whose phone produced an image the browser couldn't decode
 * — HEIC, i.e. every iPhone by default — tapped upload, saw nothing happen,
 * ordered anyway, and nobody found out until the cashier had to go and ask.
 */

const compressImageFile = vi.fn();
vi.mock("@/lib/images/compress", () => ({ compressImageFile }));

const { prepareReceipt } = await import("@/lib/images/receipt");

/** Minimal FileReader that resolves to a predictable data URL. */
class FakeReader {
  result: string | null = null;
  error: unknown = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  static fail = false;
  readAsDataURL(blob: Blob) {
    queueMicrotask(() => {
      if (FakeReader.fail) {
        this.error = new Error("nope");
        this.onerror?.();
        return;
      }
      this.result = `data:${blob.type || "image/jpeg"};base64,AAAA`;
      this.onload?.();
    });
  }
}

const file = (name: string, type: string, bytes: number): File =>
  new File([new Uint8Array(bytes)], name, { type });

beforeEach(() => {
  compressImageFile.mockReset();
  FakeReader.fail = false;
  vi.stubGlobal("FileReader", FakeReader);
});

describe("prepareReceipt", () => {
  it("sends the compressed image when the browser can decode it", async () => {
    compressImageFile.mockResolvedValue({ file: file("small.jpg", "image/jpeg", 50_000) });
    const r = await prepareReceipt(file("shot.jpg", "image/jpeg", 4_000_000));
    expect(r.error).toBeNull();
    expect(r.dataUrl).toMatch(/^data:image\/jpeg;base64,/);
  });

  // The whole point. An iPhone's HEIC can't be drawn to a canvas, but the
  // original bytes are a perfectly good receipt — send them rather than
  // silently sending nothing.
  it("falls back to the original bytes when compression fails", async () => {
    compressImageFile.mockRejectedValue(new Error("cannot decode HEIC"));
    const r = await prepareReceipt(file("IMG_0421.heic", "image/heic", 400_000));
    expect(r.error).toBeNull();
    expect(r.dataUrl).not.toBeNull();
  });

  it("refuses a file that could never reach the server, and says why", async () => {
    compressImageFile.mockRejectedValue(new Error("cannot decode"));
    const r = await prepareReceipt(file("huge.heic", "image/heic", 9_000_000));
    expect(r.dataUrl).toBeNull();
    expect(r.error).toMatch(/too large/i);
  });

  it("refuses a non-image outright", async () => {
    const r = await prepareReceipt(file("statement.pdf", "application/pdf", 1000));
    expect(r.dataUrl).toBeNull();
    expect(r.error).toMatch(/not an image/i);
    expect(compressImageFile).not.toHaveBeenCalled();
  });

  it("reports a read failure rather than returning an empty receipt", async () => {
    compressImageFile.mockResolvedValue({ file: file("ok.jpg", "image/jpeg", 1000) });
    FakeReader.fail = true;
    const r = await prepareReceipt(file("ok.jpg", "image/jpeg", 1000));
    expect(r.dataUrl).toBeNull();
    expect(r.error).toBeTruthy();
  });

  // Every failure path must produce a message. A null receipt with a null error
  // is exactly the silence this module exists to remove.
  it("never fails silently", async () => {
    compressImageFile.mockRejectedValue(new Error("x"));
    for (const f of [
      file("big.heic", "image/heic", 9_000_000),
      file("doc.txt", "text/plain", 10),
    ]) {
      const r = await prepareReceipt(f);
      if (r.dataUrl === null) expect(r.error).toBeTruthy();
    }
  });
});
