/** What every server action in this app returns to its form. */
export type FormState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; message: string; secret?: string };

export const IDLE: FormState = { status: "idle" };

/** A requireAgent()/requireStaff() failure, as a sentence for the form. */
export function authFailure(e: unknown): FormState {
  return {
    status: "error",
    message:
      e instanceof Error && e.message === "FORBIDDEN"
        ? "This account cannot do that."
        : "Your session has expired. Sign in again.",
  };
}

/** FormData → plain strings, for the parsers in src/lib. */
export function formStrings(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string") out[k] = v;
  return out;
}
