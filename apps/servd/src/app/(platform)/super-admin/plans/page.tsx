import { permanentRedirect } from "next/navigation";

/** Plans moved to /hq/products, alongside the products they belong to. */
export default function SuperAdminPlansMoved() {
  permanentRedirect("/hq/products");
}
