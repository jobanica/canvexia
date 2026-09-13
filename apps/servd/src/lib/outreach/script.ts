/**
 * The suggested personalized opener the operator reads on the phone. Taglish,
 * speaks the prospect's business name + the pain (no on-screen text needed for
 * v1). Pure + client-safe so the record page and the super-admin preview share
 * one source.
 */
export function outreachScript(businessName: string): string {
  const name = businessName?.trim() || "kayo";
  return (
    `Uy ${name} — pag may nagmessage sa page niyo ng alas-onse ng gabi, ` +
    `"open pa ba kayo?" or "magkano delivery?", walang sumasagot no? ` +
    `Nawawalang order 'yun. May solusyon ako para sa ${name}…`
  );
}

/** ~8–12s intro; keep the recording short. */
export const MAX_INTRO_SECONDS = 20;
