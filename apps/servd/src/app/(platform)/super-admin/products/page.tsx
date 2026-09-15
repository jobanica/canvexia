import { permanentRedirect } from "next/navigation";

/** Products moved to /hq/products. */
export default function SuperAdminProductsMoved() {
  permanentRedirect("/hq/products");
}
