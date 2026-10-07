import type { Feature } from "@/lib/billing/features";
import { FEATURE_META } from "@/lib/billing/features";
import { AskToAdd } from "@/components/billing/AskToAdd";

/** A locked feature: asked for, not bought online (D38). */
export function UnlockFeatureButton({ feature, price }: { feature: Feature; price: string; pending?: boolean }) {
  const label = FEATURE_META.find((f) => f.key === feature)?.label ?? "this feature";
  return <AskToAdd what={label} price={price} />;
}
