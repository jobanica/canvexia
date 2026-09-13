import { redirect } from "next/navigation";
import { getBuildState } from "@/server/build/queries";
import { setBuildCookie } from "@/server/build/session";

export const metadata = { robots: { index: false, follow: false } };

/**
 * Return-to-edit link. Many owners won't finish in one sitting, so the token
 * doubles as a magic URL: opening it re-establishes the cookie and drops them
 * back into the wizard exactly where they left off.
 *
 * This is also what makes an emailed activate link work at all — the recipient
 * is almost certainly on a different device from the one they built on, so
 * without the token in the URL there'd be no preview to activate.
 */
export default async function ResumeBuildPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ go?: string }>;
}) {
  const { token } = await params;
  const { go } = await searchParams;
  const state = await getBuildState(token);
  if (state) await setBuildCookie(token);
  // `?go=activate` comes from the "Activate my restaurant" button in a
  // marketing email: the cookie is set here, then the wizard opens on the
  // activation step rather than making them find it again.
  redirect(go === "activate" || go === "preview" ? `/build?go=${go}` : "/build");
}
