import { permanentRedirect } from "next/navigation";

/**
 * Merchants moved to /hq/merchants, which shows every product rather than
 * restaurants only. Moved, not copied — see the note on the partners redirect.
 */
export default function SuperAdminMerchantsMoved() {
  permanentRedirect("/hq/merchants");
}
