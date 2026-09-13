import { describe, it, expect } from "vitest";
import {
  applyMergeTags,
  escapeHtml,
  linkifyEscaped,
  renderEmail,
  buildRecipientLinks,
  BUTTON_TAG,
  type MergeFields,
} from "@/lib/email/render";

const UNSUB = "https://www.servdph.com/unsubscribe/abc123";
const BASE = "https://www.servdph.com";

const fields: MergeFields = {
  name: "Brew Mate",
  email: "a@b.co",
  activateUrl: `${BASE}/build/tok123?go=activate`,
  previewUrl: `${BASE}/preview/brew-mate`,
  buildUrl: `${BASE}/build/tok123`,
};

describe("applyMergeTags", () => {
  it("fills the known tags", () => {
    expect(applyMergeTags("Hi {{name}}, we have {{email}}", fields)).toBe(
      "Hi Brew Mate, we have a@b.co",
    );
  });

  it("fills the per-recipient links", () => {
    expect(applyMergeTags("Go: {{activate}} · See: {{preview}} · Back: {{build}}", fields)).toBe(
      `Go: ${fields.activateUrl} · See: ${fields.previewUrl} · Back: ${fields.buildUrl}`,
    );
  });

  it("tolerates whitespace inside the braces", () => {
    expect(applyMergeTags("Hi {{ name }}", fields)).toBe("Hi Brew Mate");
  });

  // A visible {{oops}} in the founder's test send is a bug they can SEE and fix.
  // Silently blanking it would ship a sentence with a hole in it to the list.
  it("leaves an unknown tag visible rather than blanking it", () => {
    expect(applyMergeTags("Hi {{oops}}", fields)).toBe("Hi {{oops}}");
  });

  it("replaces every occurrence", () => {
    expect(applyMergeTags("{{name}} & {{name}}", fields)).toBe("Brew Mate & Brew Mate");
  });
});

describe("escapeHtml", () => {
  it("neutralises markup from the body", () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
  });
});

describe("linkifyEscaped", () => {
  it("makes a bare URL clickable", () => {
    expect(linkifyEscaped("go to https://a.co/x now")).toContain(
      '<a href="https://a.co/x"',
    );
  });

  it("leaves trailing punctuation outside the link", () => {
    const out = linkifyEscaped("see https://a.co/x.");
    expect(out).toContain('href="https://a.co/x"');
    expect(out).toMatch(/<\/a>\.$/);
  });

  // It runs on already-escaped text, so a query string's & is &amp; — which is
  // exactly what an HTML attribute needs, not a bug to "fix".
  it("keeps an escaped ampersand inside the href", () => {
    expect(linkifyEscaped("https://a.co/x?a=1&amp;b=2")).toContain(
      'href="https://a.co/x?a=1&amp;b=2"',
    );
  });
});

describe("renderEmail", () => {
  const body = "Hi {{name}},\n\nYour page is ready.";

  it("merges tags into both the text and HTML bodies", () => {
    const { text, html } = renderEmail(body, fields, UNSUB);
    expect(text).toContain("Hi Brew Mate,");
    expect(html).toContain("Hi Brew Mate,");
    expect(html).not.toContain("{{name}}");
  });

  // The footer is appended by the renderer, never left to whoever writes the
  // campaign — an email without a working unsubscribe isn't legal to send.
  it("always appends the unsubscribe link to both bodies", () => {
    const { text, html } = renderEmail("No footer written here.", fields, UNSUB);
    expect(text).toContain(UNSUB);
    expect(html).toContain(UNSUB);
  });

  it("splits blank-line-separated paragraphs into <p> blocks", () => {
    const { html } = renderEmail("One.\n\nTwo.", fields, UNSUB);
    expect(html.match(/<p /g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps single newlines as line breaks", () => {
    const { html } = renderEmail("Line one\nLine two", fields, UNSUB);
    expect(html).toContain("<br>");
  });

  // The merged value goes through escaping too — a restaurant called
  // "Tom & Jerry's <Cafe>" must not break the markup.
  it("escapes a merged restaurant name in the HTML body", () => {
    const { html } = renderEmail("Hi {{name}}", { ...fields, name: "Tom & <Cafe>" }, UNSUB);
    expect(html).toContain("Tom &amp; &lt;Cafe&gt;");
    expect(html).not.toContain("<Cafe>");
  });

  describe("activate button", () => {
    const withButton = `Ready?\n\n${BUTTON_TAG}\n\nSee you.`;

    it("renders a real HTML button pointing at this recipient's link", () => {
      const { html } = renderEmail(withButton, fields, UNSUB);
      expect(html).toContain(`href="${fields.activateUrl}"`);
      expect(html).toContain("Activate my restaurant");
      expect(html).not.toContain(BUTTON_TAG);
    });

    // A text-only client gets no button, so it must still get the URL —
    // otherwise the call to action silently disappears for those readers.
    it("becomes a labelled URL in the plain-text body", () => {
      const { text } = renderEmail(withButton, fields, UNSUB);
      expect(text).toContain(fields.activateUrl);
      expect(text).not.toContain(BUTTON_TAG);
    });

    it("works mid-paragraph, not just on its own line", () => {
      const { html } = renderEmail(`Tap here: ${BUTTON_TAG} today`, fields, UNSUB);
      expect(html).toContain(`href="${fields.activateUrl}"`);
      expect(html).not.toContain(BUTTON_TAG);
    });
  });
});

describe("buildRecipientLinks", () => {
  // The link has to carry the build token: the recipient is opening this on a
  // different device, and without it there's no preview to activate.
  it("sends an unpaid lead to their own build token, on the activate step", () => {
    const links = buildRecipientLinks(BASE, {
      status: "preview",
      slug: "brew-mate",
      buildToken: "tok123",
    });
    expect(links.activateUrl).toBe(`${BASE}/build/tok123?go=activate`);
    expect(links.previewUrl).toBe(`${BASE}/preview/brew-mate`);
    // Track A's call to action: back into the wizard, not to the payment step.
    expect(links.buildUrl).toBe(`${BASE}/build/tok123`);
  });

  it("sends a paying customer to login and their live site, not to activation", () => {
    const links = buildRecipientLinks(BASE, {
      status: "active",
      slug: "brew-mate",
      buildToken: "tok123",
    });
    expect(links.activateUrl).toBe(`${BASE}/login`);
    expect(links.previewUrl).toBe(`${BASE}/r/brew-mate`);
  });

  it("sends an archived preview back to the builder rather than a dead link", () => {
    const links = buildRecipientLinks(BASE, {
      status: "archived",
      slug: "brew-mate",
      buildToken: null,
    });
    expect(links.activateUrl).toBe(`${BASE}/build`);
  });

  it("tolerates a trailing slash on the app URL", () => {
    const links = buildRecipientLinks(`${BASE}/`, {
      status: "preview",
      slug: "s",
      buildToken: "t",
    });
    expect(links.activateUrl).toBe(`${BASE}/build/t?go=activate`);
  });
});
