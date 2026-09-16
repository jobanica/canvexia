/**
 * The provider interface now lives in `@servd/core` — it is types, and two
 * axes speak it as of A8.
 *
 * Re-exported here rather than deleted because half a dozen files import it by
 * this path, and a rename touching all of them in the same commit as the
 * two-axis lift would make one change nobody can review. New code should import
 * from `@servd/core`.
 */
export type { SendResult, InboundMessage, SmsProvider } from "@servd/core";
