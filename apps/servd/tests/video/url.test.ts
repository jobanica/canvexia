import { describe, it, expect } from "vitest";
import {
  youtubeId,
  vimeoId,
  isVideoFile,
  toAutoplayEmbedUrl,
  autoPoster,
  isSupportedVideoUrl,
} from "@/lib/video";

/**
 * Whatever YouTube handed the founder has to work — the address bar, the Share
 * button, or a pasted embed. Asking someone to "extract the video ID" is asking
 * them to get it wrong.
 */

const ID = "dQw4w9WgXcQ";

describe("youtubeId", () => {
  it("reads every shape YouTube hands out", () => {
    const urls = [
      `https://www.youtube.com/watch?v=${ID}`,
      `https://youtube.com/watch?v=${ID}`,
      `https://m.youtube.com/watch?v=${ID}`,
      `https://youtu.be/${ID}`,
      `https://www.youtube.com/embed/${ID}`,
      `https://www.youtube.com/shorts/${ID}`,
      `https://www.youtube.com/live/${ID}`,
    ];
    for (const u of urls) expect(youtubeId(u), u).toBe(ID);
  });

  // The Share button adds a timestamp; the address bar adds a playlist.
  it("survives the extra params the share button adds", () => {
    expect(youtubeId(`https://youtu.be/${ID}?t=42`)).toBe(ID);
    expect(youtubeId(`https://www.youtube.com/watch?v=${ID}&t=42s`)).toBe(ID);
    expect(youtubeId(`https://www.youtube.com/watch?list=PLabc&v=${ID}`)).toBe(ID);
  });

  it("tolerates surrounding whitespace from a paste", () => {
    expect(youtubeId(`  https://youtu.be/${ID}\n`)).toBe(ID);
  });

  it("returns null for anything that isn't YouTube", () => {
    expect(youtubeId("https://example.com/video")).toBeNull();
    expect(youtubeId("")).toBeNull();
    expect(youtubeId("just some words")).toBeNull();
  });
});

describe("vimeoId", () => {
  it("reads both Vimeo shapes", () => {
    expect(vimeoId("https://vimeo.com/123456789")).toBe("123456789");
    expect(vimeoId("https://vimeo.com/video/123456789")).toBe("123456789");
  });
});

describe("isVideoFile", () => {
  it("spots a direct file, query string and all", () => {
    expect(isVideoFile("https://cdn.co/a.mp4")).toBe(true);
    expect(isVideoFile("https://cdn.co/a.MP4?token=1")).toBe(true);
    expect(isVideoFile("https://cdn.co/a.webm")).toBe(true);
    expect(isVideoFile("https://cdn.co/page.html")).toBe(false);
  });
});

describe("toAutoplayEmbedUrl", () => {
  // Autoplay is right here because this URL is only ever built AFTER someone
  // taps the play button — they've asked for it.
  it("turns any YouTube link into an autoplaying embed", () => {
    const out = toAutoplayEmbedUrl(`https://youtu.be/${ID}?t=9`);
    expect(out).toBe(`https://www.youtube.com/embed/${ID}?autoplay=1&rel=0&playsinline=1`);
  });

  it("handles Vimeo", () => {
    expect(toAutoplayEmbedUrl("https://vimeo.com/123")).toBe("https://player.vimeo.com/video/123?autoplay=1");
  });

  it("passes an unrecognized URL through untouched", () => {
    expect(toAutoplayEmbedUrl("https://cdn.co/a.mp4")).toBe("https://cdn.co/a.mp4");
  });
});

describe("autoPoster", () => {
  // The whole reason the form has one field instead of two.
  it("derives a thumbnail from the YouTube link", () => {
    expect(autoPoster(`https://www.youtube.com/watch?v=${ID}`)).toBe(
      `https://img.youtube.com/vi/${ID}/hqdefault.jpg`,
    );
  });

  it("has nothing to derive for a non-YouTube source", () => {
    expect(autoPoster("https://cdn.co/a.mp4")).toBeNull();
    expect(autoPoster("")).toBeNull();
  });
});

describe("isSupportedVideoUrl", () => {
  // The save guard. A typo'd link would render an empty black box on the page
  // paid traffic lands on, and nobody would notice until the spend was gone.
  it("accepts what we can actually render", () => {
    expect(isSupportedVideoUrl(`https://youtu.be/${ID}`)).toBe(true);
    expect(isSupportedVideoUrl("https://vimeo.com/123")).toBe(true);
    expect(isSupportedVideoUrl("https://cdn.co/clip.mp4")).toBe(true);
  });

  it("rejects junk, prose, and a bare filename", () => {
    expect(isSupportedVideoUrl("")).toBe(false);
    expect(isSupportedVideoUrl("   ")).toBe(false);
    expect(isSupportedVideoUrl("my video")).toBe(false);
    expect(isSupportedVideoUrl("https://example.com/watch")).toBe(false);
    expect(isSupportedVideoUrl("clip.mp4")).toBe(false); // not a URL
  });
});
