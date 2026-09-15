/**
 * The CANVEXIA mark and wordmark.
 *
 * Moved to `packages/ui` when the partner portal started drawing the same logo
 * from a different Next process — a logo copied into two apps is a logo that
 * drifts. Re-exported here so this app's imports read the way its other
 * components do; `packages/ui/src/brand.tsx` is where the geometry lives.
 */
export { Mark, Wordmark } from "@servd/ui";
