/**
 * Branch activation used to be a ₱499 Xendit checkout, settled by the
 * gateway's webhook. The gateway is retired (D38): an owner asks for a branch
 * and HQ switches it on from super-admin → Merchants.
 *
 * The note survives because activation_requests rows written by the old flow
 * carry it, and the bizops history still tells branch activations apart from
 * DIY ones by it.
 */
export const BRANCH_NOTE = "branch-activation";
