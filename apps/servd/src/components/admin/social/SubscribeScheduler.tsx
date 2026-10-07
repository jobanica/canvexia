import { AskToAdd } from "@/components/billing/AskToAdd";

/** The content scheduler: asked for, not subscribed to online (D38). */
export function SubscribeScheduler({ price }: { price: string; pending?: boolean }) {
  return <AskToAdd what="the content scheduler" price={`${price} / month`} />;
}
