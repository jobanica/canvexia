import { supportMessengerUrl } from "@/lib/branding/app-domain";

/**
 * Where a "Buy now" button used to be.
 *
 * Online card/e-wallet checkout through the payment gateway is retired (D38):
 * every payment is now a bank or QR transfer confirmed by a person. An add-on
 * is therefore something the owner asks for, CANVEXIA confirms the payment,
 * and an admin switches it on — not a self-serve checkout.
 */
export function AskToAdd({ what, price }: { what: string; price?: string }) {
  return (
    <div className="rounded-lg border border-plum-ink/10 bg-white p-3 text-sm text-plum-ink/70">
      <p>
        To add <strong>{what}</strong>
        {price ? <> ({price})</> : null}, message us and we&apos;ll set it up. Payment is by bank or
        e-wallet transfer, like your subscription.
      </p>
      <a
        href={supportMessengerUrl()}
        target="_blank"
        rel="noreferrer"
        className="mt-2 inline-block font-semibold text-brand-primary"
      >
        Message us →
      </a>
    </div>
  );
}
