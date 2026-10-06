import { AskToAdd } from "@/components/billing/AskToAdd";

/** Unlimited tables: asked for, not bought online (D38). */
export function UnlockTablesCard({ price }: { price: string; pending?: boolean }) {
  return <AskToAdd what="unlimited tables" price={price} />;
}
