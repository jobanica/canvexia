import { unsubscribeByToken } from "@/server/email/audience";

export const metadata = { title: "Unsubscribed · Servd", robots: { index: false, follow: false } };

/**
 * One-click unsubscribe. No login and no confirmation step: every marketing
 * email carries this link, and making someone sign in to stop hearing from us
 * would be both hostile and non-compliant. Visiting the link opts them out.
 */
export default async function UnsubscribePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await unsubscribeByToken(token);

  return (
    <main className="flex min-h-screen items-center justify-center bg-cream px-4">
      <div className="w-full max-w-md rounded-tile border border-plum-ink/10 bg-white p-8 text-center">
        {result ? (
          <>
            <div className="text-4xl">✅</div>
            <h1 className="mt-3 font-heading text-2xl font-bold text-plum-ink">You're unsubscribed</h1>
            <p className="mt-2 text-sm text-plum-ink/60">
              We won't send marketing email to {result.name} again. Anything about your account or
              your orders still reaches you.
            </p>
          </>
        ) : (
          <>
            <h1 className="font-heading text-xl font-bold text-plum-ink">Link not recognised</h1>
            <p className="mt-2 text-sm text-plum-ink/60">
              This unsubscribe link has expired or was already used. If you keep getting email,
              reply to one and we'll take you off by hand.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
