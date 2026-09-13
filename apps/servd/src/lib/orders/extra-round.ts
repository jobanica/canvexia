/**
 * Extra rounds — the table that has already eaten and orders more.
 *
 * A ticket leaves the kitchen display the moment the cook presses "Mark ready",
 * so an order that comes back for a second round has nowhere to appear: the
 * items land on the bill, the cashier sees them, and the kitchen never does.
 * The kitchen had to know to go looking in the history and reopen the ticket by
 * hand — which only works if somebody tells them there is something to look for.
 *
 * The rule is here rather than inline so it can be stated once and tested:
 * adding to a ticket the kitchen is still holding changes nothing, and adding
 * to one it has finished puts it back on the board.
 */

/** The statuses an order can be in while the kitchen display is showing it. */
const ON_THE_BOARD = ["new", "preparing"];

/**
 * Does appending items to this order need the ticket put back in front of the
 * kitchen?
 *
 * Only when the cook has already finished it. A ticket still on the board picks
 * the new lines up on its next refresh, and moving its status would shove it
 * back to the start of the queue for no reason.
 *
 * `closed` and `cancelled` are not here on purpose: those orders can't take new
 * items at all, so they never reach this question.
 */
export function needsKitchenReopen(status: string): boolean {
  return status === "done";
}

/**
 * Where a reopened ticket goes back to: `preparing`, never `new`.
 *
 * The customer at that table has already been waiting once. Dropping the ticket
 * in as if it had just arrived would restart its clock and hide, from the one
 * screen that shows waiting times, the fact that these people are on their
 * second round.
 */
export function reopenStatus(): "preparing" {
  return "preparing";
}

/** Is this ticket currently in front of the kitchen? */
export function isOnKitchenBoard(status: string): boolean {
  return ON_THE_BOARD.includes(status);
}

/**
 * Which of an order's lines were already there before this round.
 *
 * The kitchen made those. Ticking them off is what turns "the whole ticket is
 * back, work out what's new" into "here are the two extras" — it reuses the
 * strike-through the cook already reads, rather than inventing a second way of
 * saying the same thing.
 */
export function previousLineIds(
  before: readonly { id: string; preparedAt?: Date | string | null }[],
): string[] {
  // Ones already ticked need no second write.
  return before.filter((i) => !i.preparedAt).map((i) => i.id);
}
