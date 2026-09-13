/**
 * Turning a campaign body into one person's email. Pure and framework-free so
 * the merge-tag, linking and escaping rules are testable — they're the part
 * that would quietly send `{{name}}` to two hundred people if it broke.
 */

export interface MergeFields {
  name: string;
  email: string;
  /** Where THIS recipient goes to activate — carries their build token. */
  activateUrl: string;
  /** Their storefront: the preview while unpaid, the live site once active. */
  previewUrl: string;
  /** Back into the builder to finish — the Track A call to action. */
  buildUrl: string;
}

/** The big call-to-action. Rendered as a button in HTML, a URL in plain text. */
export const BUTTON_TAG = "{{activate_button}}";

/**
 * Fills `{{name}}`, `{{email}}`, `{{activate}}` and `{{preview}}`. Unknown tags
 * are left alone, not blanked — a visible `{{oops}}` in a preview is better
 * than silent data loss.
 */
export function applyMergeTags(body: string, fields: MergeFields): string {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, key: string) => {
    if (key === "name") return fields.name;
    if (key === "email") return fields.email;
    if (key === "activate") return fields.activateUrl;
    if (key === "preview") return fields.previewUrl;
    if (key === "build") return fields.buildUrl;
    return whole;
  });
}

/** Minimal HTML escaping — campaign bodies are plain text authored by us. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Makes bare URLs clickable in the HTML body. Runs on ALREADY-ESCAPED text, so
 * a link's `&` is `&amp;` by the time it reaches the href — which is exactly
 * what an HTML attribute wants. Trailing sentence punctuation is left outside
 * the link so "see {{preview}}." doesn't swallow the full stop.
 */
export function linkifyEscaped(escaped: string): string {
  return escaped.replace(/https?:\/\/[^\s<]+/g, (url) => {
    const trimmed = url.replace(/[.,;:!?)]+$/, "");
    const tail = url.slice(trimmed.length);
    return `<a href="${trimmed}" style="color:#e8622c">${trimmed}</a>${tail}`;
  });
}

/** The HTML call-to-action button. Inline styles — email clients ignore CSS. */
function buttonHtml(url: string): string {
  return `<p style="margin:0 0 16px;text-align:center">
<a href="${escapeHtml(url)}" style="display:inline-block;background:#e8622c;color:#ffffff;font-weight:700;font-size:16px;text-decoration:none;padding:14px 28px;border-radius:999px">Activate my restaurant →</a>
</p>`;
}

export interface RenderedEmail {
  text: string;
  html: string;
}

/**
 * Renders the plain-text and HTML bodies for one recipient, both carrying the
 * unsubscribe link. It is appended here rather than left to the author so an
 * email can't go out without one — that's a legal requirement, not a nicety.
 */
export function renderEmail(
  body: string,
  fields: MergeFields,
  unsubscribeUrl: string,
): RenderedEmail {
  const merged = applyMergeTags(body, fields);

  // Plain text has no buttons — the tag becomes a labelled URL so a text-only
  // client still gets a working call to action.
  const text = `${merged.split(BUTTON_TAG).join(`Activate your restaurant: ${fields.activateUrl}`)}
\n—\nDon't want these emails? Unsubscribe: ${unsubscribeUrl}`;

  const paragraphs = merged
    .split(/\n{2,}/)
    .map((p) => {
      // A paragraph that is just the button tag becomes the button alone.
      if (p.trim() === BUTTON_TAG) return buttonHtml(fields.activateUrl);
      const withButton = p
        .split(BUTTON_TAG)
        .map((part) => linkifyEscaped(escapeHtml(part)).replace(/\n/g, "<br>"))
        .join(buttonHtml(fields.activateUrl));
      return `<p style="margin:0 0 16px;line-height:1.6">${withButton}</p>`;
    })
    .join("");

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;color:#2b2130;max-width:560px;margin:0 auto;padding:24px">
${paragraphs}
<hr style="border:none;border-top:1px solid #e8e2ea;margin:28px 0 12px">
<p style="margin:0;font-size:12px;color:#8d8394">
Don't want these emails? <a href="${escapeHtml(unsubscribeUrl)}" style="color:#8d8394">Unsubscribe</a>.
</p>
</div>`;

  return { text, html };
}

export interface LinkSource {
  status: string;
  slug: string;
  buildToken: string | null;
}

export interface RecipientLinks {
  activateUrl: string;
  previewUrl: string;
  buildUrl: string;
}

/**
 * The per-recipient links a campaign can drop into a body.
 *
 * The activate link goes through /build/{token}, which re-establishes the build
 * cookie before landing on the activation step — the recipient is almost
 * certainly opening this on a different device from the one they built on, and
 * without that the activate button would find no preview to activate.
 *
 * A recipient who has already paid has nothing to activate, so both links point
 * somewhere useful for them instead of somewhere broken.
 */
export function buildRecipientLinks(base: string, r: LinkSource): RecipientLinks {
  const root = base.replace(/\/+$/, "");
  if (r.status === "preview" && r.buildToken) {
    return {
      activateUrl: `${root}/build/${r.buildToken}?go=activate`,
      previewUrl: `${root}/preview/${r.slug}`,
      buildUrl: `${root}/build/${r.buildToken}`,
    };
  }
  if (r.status === "active") {
    return {
      activateUrl: `${root}/login`,
      previewUrl: `${root}/r/${r.slug}`,
      buildUrl: `${root}/login`,
    };
  }
  // Archived preview (media dropped, token cleared) — send them to rebuild.
  return { activateUrl: `${root}/build`, previewUrl: `${root}/build`, buildUrl: `${root}/build` };
}

/**
 * An ACCOUNT email — activation confirmations, credentials, password notices.
 *
 * Deliberately a separate function from renderEmail rather than a flag on it:
 * marketing mail must always carry an unsubscribe link, and the way to keep
 * that guarantee absolute is to give it no bypass. These are transactional —
 * someone who unsubscribed from marketing still needs to be told how to get
 * into the account they just paid for.
 */
export function renderAccountEmail(paragraphs: string[]): RenderedEmail {
  const text = paragraphs.join("\n\n");
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;color:#2b2130;max-width:560px;margin:0 auto;padding:24px">
${paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;line-height:1.6">${linkifyEscaped(escapeHtml(p)).replace(/\n/g, "<br>")}</p>`,
    )
    .join("")}
</div>`;
  return { text, html };
}

/** A standalone call-to-action button for an account email. */
export function accountButton(label: string, url: string): string {
  return `<p style="margin:0 0 16px;text-align:center"><a href="${escapeHtml(url)}" style="display:inline-block;background:#e8622c;color:#ffffff;font-weight:700;font-size:16px;text-decoration:none;padding:14px 28px;border-radius:999px">${escapeHtml(label)}</a></p>`;
}
