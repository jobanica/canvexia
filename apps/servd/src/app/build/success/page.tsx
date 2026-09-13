import { notFound } from "next/navigation";
import { getActivationStatus } from "@/server/build/activation";
import { ActivationStatusPanel } from "@/components/build/ActivationStatusPanel";
import { Pixel } from "@/components/create/Pixel";

export const metadata = {
  title: "Activating your restaurant · Servd",
  robots: { index: false, follow: false },
};

/**
 * Post-payment landing page. It is deliberately READ-ONLY: it reports what the
 * webhook has done and nothing more.
 *
 * Activating here instead would mean anyone who guessed this URL could mint a
 * free account, and it would silently fail for the many customers who close the
 * tab the moment Xendit says "paid". The webhook covers both cases.
 */
export default async function BuildSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ r?: string }>;
}) {
  const { r } = await searchParams;
  if (!r) notFound();
  const status = await getActivationStatus(r);
  if (!status) notFound();

  return (
    <main className="min-h-screen bg-cream px-4 py-16">
      {/* Loaded here so the panel can report the Purchase — this is the page
          that knows a payment actually landed. */}
      <Pixel pixelId={process.env.NEXT_PUBLIC_META_PIXEL_ID ?? ""} />
      <ActivationStatusPanel requestId={r} initial={status} />
    </main>
  );
}
