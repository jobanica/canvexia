import "server-only";
// Imported for the side effect: the adapter registers itself. Anything that
// dispatches must import THIS module rather than @servd/core directly, or the
// registry will be empty and every product will report "no adapter".
import "./resceta-adapter";

export { provisionableProducts } from "@servd/core";
export { rescetaAdapter } from "./resceta-adapter";
