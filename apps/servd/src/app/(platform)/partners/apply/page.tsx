import { redirect } from "next/navigation";

/**
 * The partner application lives at /partner/apply. This alias catches the
 * /partners/apply path (used by some marketing links) and forwards to it.
 */
export default function PartnersApplyAlias() {
  redirect("/partner/apply");
}
