import { notFound } from "next/navigation";
import { getClaim } from "@/server/build/claim";
import { ClaimForm } from "@/components/build/ClaimForm";

export const metadata = {
  title: "Set your password · Servd",
  robots: { index: false, follow: false },
};

/**
 * One-time "set your own password" link, handed over after a paid activation.
 *
 * Activation creates the login with a random password nobody ever sees, so no
 * usable credential is stored in the database or printed on a page. This link
 * is burned the moment it's used.
 */
export default async function ClaimPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const target = await getClaim(token);
  if (!target) notFound();

  return (
    <main className="min-h-screen bg-cream px-4 py-16">
      <ClaimForm token={token} restaurantName={target.restaurantName} username={target.username} />
    </main>
  );
}
