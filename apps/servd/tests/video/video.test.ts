import { describe, it, expect } from "vitest";
import { parseVideoSource } from "@/lib/video";

describe("parseVideoSource", () => {
  it("detects YouTube in various forms", () => {
    for (const u of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ",
      "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    ]) {
      const s = parseVideoSource(u);
      expect(s.kind).toBe("youtube");
      if (s.kind === "youtube") expect(s.embedUrl).toContain("dQw4w9WgXcQ");
    }
  });

  it("detects Vimeo", () => {
    const s = parseVideoSource("https://vimeo.com/123456789");
    expect(s.kind).toBe("vimeo");
    if (s.kind === "vimeo") expect(s.embedUrl).toBe("https://player.vimeo.com/video/123456789");
  });

  it("treats direct links as files", () => {
    const s = parseVideoSource("https://cdn.example.com/clip.mp4");
    expect(s.kind).toBe("file");
    if (s.kind === "file") expect(s.url).toContain("clip.mp4");
  });
});
