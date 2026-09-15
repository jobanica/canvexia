import { permanentRedirect } from "next/navigation";

/**
 * Partners moved to /hq/partners.
 *
 * MOVED, NOT COPIED. The two screens would both edit a partner's terms, and two
 * screens that edit one thing is how the terms come to disagree with
 * themselves. What was here — approvals, the operator form, the training video
 * — is either on /hq/partners now or lands there in a later phase.
 *
 * `permanentRedirect` rather than a link or a notice: anybody with this URL in
 * a bookmark or a browser's autocomplete should end up at the real screen
 * without reading anything first.
 */
export default function SuperAdminPartnersMoved() {
  permanentRedirect("/hq/partners");
}
