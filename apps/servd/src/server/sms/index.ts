import "server-only";
import { SemaphoreProvider } from "./semaphore";
import type { SmsProvider } from "./provider";

/**
 * Returns the platform's configured SMS provider, or null if no key is set.
 * The platform holds ONE account; per-restaurant metering happens via credits.
 */
export function getSmsProvider(): SmsProvider | null {
  const key = process.env.SEMAPHORE_API_KEY;
  if (!key) return null;
  return new SemaphoreProvider(key);
}
