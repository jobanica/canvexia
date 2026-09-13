import { describe, it, expect } from "vitest";
import {
  fitWithin,
  needsCompression,
  jpegName,
  DEFAULT_MAX_DIM,
  DEFAULT_TARGET_BYTES,
  HARD_MAX_BYTES,
} from "@/lib/images/compress";

/**
 * A menu photo used to be posted at whatever size the camera produced, and the
 * hosting platform caps a Server Action body at ~4.5 MB — below the 5 MB the
 * app itself allowed. The upload was rejected before any of our code ran, so
 * nothing could report it, and the page white-screened.
 *
 * These cover the sizing rules that keep an upload under that ceiling.
 */

describe("fitWithin", () => {
  it("scales a big photo down to the longest edge", () => {
    // A typical 12 MP phone photo, landscape.
    expect(fitWithin(4032, 3024)).toEqual({ width: 1600, height: 1200 });
  });

  it("handles portrait the same way", () => {
    expect(fitWithin(3024, 4032)).toEqual({ width: 1200, height: 1600 });
  });

  it("keeps the aspect ratio", () => {
    const { width, height } = fitWithin(4000, 1000);
    expect(width / height).toBeCloseTo(4, 5);
  });

  // Upscaling a small photo would add bytes and no detail.
  it("never scales up", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(DEFAULT_MAX_DIM, 900)).toEqual({ width: DEFAULT_MAX_DIM, height: 900 });
  });

  // A 0-height canvas throws, which would turn a compression attempt into the
  // very crash this is meant to prevent.
  it("never produces a zero dimension", () => {
    const r = fitWithin(20000, 3, 1600);
    expect(r.width).toBeGreaterThan(0);
    expect(r.height).toBeGreaterThanOrEqual(1);
  });

  it("tolerates a zero-sized source", () => {
    expect(fitWithin(0, 0)).toEqual({ width: 0, height: 0 });
  });

  it("respects a custom limit", () => {
    expect(fitWithin(2000, 1000, 500)).toEqual({ width: 500, height: 250 });
  });
});

describe("needsCompression", () => {
  it("passes a small JPEG straight through — re-encoding only loses quality", () => {
    expect(needsCompression(120 * 1024, "image/jpeg")).toBe(false);
    expect(needsCompression(120 * 1024, "image/png")).toBe(false);
    expect(needsCompression(120 * 1024, "image/webp")).toBe(false);
  });

  it("compresses anything over the target", () => {
    expect(needsCompression(DEFAULT_TARGET_BYTES + 1, "image/jpeg")).toBe(true);
    expect(needsCompression(3 * 1024 * 1024, "image/png")).toBe(true);
  });

  // A HEIC that slipped past the picker has to be converted regardless of size,
  // or the server rejects the type after a pointless upload.
  it("converts an unsupported type even when it's small", () => {
    expect(needsCompression(50 * 1024, "image/heic")).toBe(true);
    expect(needsCompression(50 * 1024, "")).toBe(true);
    expect(needsCompression(50 * 1024, "application/pdf")).toBe(true);
  });

  it("is case-insensitive about the mime type", () => {
    expect(needsCompression(1000, "IMAGE/JPEG")).toBe(false);
  });
});

describe("the size ceiling", () => {
  // The whole point: our own limit must sit UNDER the platform's ~4.5 MB body
  // cap, or the failure happens somewhere we can't produce a message.
  it("refuses below the platform's request-body limit", () => {
    expect(HARD_MAX_BYTES).toBeLessThan(4.5 * 1024 * 1024);
  });

  it("targets a size comfortably under the ceiling", () => {
    expect(DEFAULT_TARGET_BYTES).toBeLessThan(HARD_MAX_BYTES);
  });
});

describe("jpegName", () => {
  it("re-extensions a converted file", () => {
    expect(jpegName("IMG_0421.HEIC")).toBe("IMG_0421.jpg");
    expect(jpegName("lunch.png")).toBe("lunch.jpg");
  });

  it("copes with dots in the name", () => {
    expect(jpegName("my.lunch.photo.heic")).toBe("my.lunch.photo.jpg");
  });

  it("copes with no extension at all", () => {
    expect(jpegName("photo")).toBe("photo.jpg");
  });

  it("falls back to a name when there's nothing to keep", () => {
    expect(jpegName(".heic")).toBe("photo.jpg");
    expect(jpegName("")).toBe("photo.jpg");
  });
});
