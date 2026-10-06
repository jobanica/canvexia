import { AskToAdd } from "@/components/billing/AskToAdd";

/** A custom domain: asked for, not bought online (D38). */
export function UnlockCustomDomainButton({ price }: { price: string; pending?: boolean }) {
  return <AskToAdd what="a custom domain" price={price} />;
}
