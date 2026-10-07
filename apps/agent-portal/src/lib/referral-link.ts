/**
 * An agent's link for one product: the product's signup URL with ?ref=CODE.
 * Any existing query is kept, and an existing ref is replaced rather than
 * duplicated.
 */
export function referralLink(signupUrl: string, code: string): string {
  const u = new URL(signupUrl);
  u.searchParams.set("ref", code);
  return u.toString();
}
