import { redirect } from "next/navigation";

/** The branded host root is now the full ordering site. */
export default function SiteOrderPage() {
  redirect("/");
}
