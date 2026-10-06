import { AskToAdd } from "@/components/billing/AskToAdd";

/** Switching a branch on: asked for, not paid online (D38). */
export function ActivateBranchButton({ price }: { restaurantId: string; price: string }) {
  return <AskToAdd what="this branch" price={price} />;
}
