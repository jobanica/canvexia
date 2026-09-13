/** Serializable order shape shared between the server and the live boards. */
export interface KitchenOrderItem {
  id: string;
  name: string;
  quantity: number;
  note: string | null;
  modifiers: string[];
  /**
   * Ticked off by the kitchen once it's plated, ISO. Struck through on every
   * tablet, so the pass can see at a glance what is still to come out of a
   * five-item ticket instead of re-reading the whole thing.
   */
  preparedAt?: string | null;
}

export interface KitchenOrder {
  id: string;
  tableNumber: string;
  /** "🥡 Takeout" etc — from lib/orders/order-type, shown under the title. */
  typeLabel?: string;
  /** "closed" only appears in the kitchen history, never in the live queue. */
  status: "new" | "preparing" | "done" | "closed";
  createdAt: string; // ISO string (serializable across the server boundary)
  total: number; // centavos
  /**
   * Where a delivery is going — present only when the restaurant has asked for
   * it (Printer settings → kitchen). A kitchen working by zone groups every
   * order heading the same way into one run instead of cooking them one ticket
   * at a time; a kitchen that doesn't work that way shouldn't have customers'
   * home addresses on a screen the whole line can read.
   */
  customerAddress?: string | null;
  /**
   * When an advance order is wanted for, ISO. Present for as long as the ticket
   * is on the board — accepting it told the kitchen about the order, it didn't
   * make it due, and a card that drops the date is a card that says "cook now".
   */
  scheduledFor?: string | null;
  /**
   * When more items were last added to this ticket, ISO.
   *
   * Set for a second round: the table ate, asked for more, and the cashier put
   * it on the same bill. The card flags it, because a ticket reappearing with
   * most of its lines already struck through otherwise looks like a mistake
   * rather than "cook the two things that aren't ticked".
   */
  addedItemsAt?: string | null;
  items: KitchenOrderItem[];
}
