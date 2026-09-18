/**
 * ESC/POS — the language thermal printers actually speak.
 *
 * REPORTED — "it has a test print, but there is no option is it via usb or via
 * bluetooth."
 *
 * There was none, because the browser's print dialog hands the page to the
 * operating system and the OS decides which printer gets it. That is a real
 * answer and a poor one: a receipt roll through the print dialog needs somebody
 * to set paper size, turn off headers and footers and fix the margins, every
 * time, on every till.
 *
 * So this is the other path — bytes straight to the printer over Bluetooth or
 * USB, with no dialog at all. These functions build those bytes and nothing
 * else: no browser APIs, no device, so the format can be proved without one.
 *
 * REFERENCE: Epson's ESC/POS command set, which every cheap thermal printer
 * sold in the Philippines implements enough of.
 */

const ESC = 0x1b;
const GS = 0x1d;

export type Align = "left" | "center" | "right";

/**
 * TEXT A THERMAL PRINTER CAN ACTUALLY PRINT.
 *
 * The default character set is CP437, which has no peso sign — sending ₱ prints
 * a random glyph, on every receipt, forever. Nothing here is decoration: each
 * of these characters appears in this app's own receipts today.
 */
export function foldToAscii(text: string): string {
  return text
    .replace(/₱/g, "P")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/≤/g, "<=")
    .replace(/≥/g, ">=")
    .replace(/×/g, "x")
    .replace(/·/g, "-")
    .replace(/…/g, "...")
    // Anything still outside plain ASCII would print as noise. A question mark
    // is visibly wrong, which is better than a glyph that looks deliberate.
    .replace(/[^\x20-\x7e\n]/g, "?");
}

export class EscPos {
  private readonly parts: number[] = [];

  /** Wake the printer and clear whatever the last job left set. */
  init(): this {
    this.parts.push(ESC, 0x40);
    return this;
  }

  align(a: Align): this {
    this.parts.push(ESC, 0x61, a === "center" ? 1 : a === "right" ? 2 : 0);
    return this;
  }

  bold(on: boolean): this {
    this.parts.push(ESC, 0x45, on ? 1 : 0);
    return this;
  }

  /** 0 is normal; 1 is double width and height, for a total or a Z number. */
  size(n: 0 | 1): this {
    this.parts.push(GS, 0x21, n === 1 ? 0x11 : 0x00);
    return this;
  }

  text(s: string): this {
    for (const ch of foldToAscii(s)) this.parts.push(ch.charCodeAt(0));
    return this;
  }

  line(s = ""): this {
    return this.text(s).feed(1);
  }

  /**
   * A label on the left and a figure on the right, padded to the roll's width.
   *
   * THE FIGURE IS NEVER TRUNCATED. If the two do not fit, the label loses
   * characters — a total reading "1,234.5" because the last digit was cut is
   * the one failure this must not have.
   */
  row(label: string, value: string, width: number): this {
    const l = foldToAscii(label);
    const v = foldToAscii(value);
    const room = Math.max(0, width - v.length - 1);
    const cut = l.length > room ? l.slice(0, room) : l;
    return this.line(cut + " ".repeat(Math.max(1, width - cut.length - v.length)) + v);
  }

  rule(width: number, ch = "-"): this {
    return this.line(ch.repeat(width));
  }

  feed(lines: number): this {
    for (let i = 0; i < lines; i += 1) this.parts.push(0x0a);
    return this;
  }

  /**
   * Feed the paper clear of the head, THEN cut.
   *
   * Without the feed the cutter slices through the last lines of the receipt,
   * because the printed text is still under the head when the blade fires.
   */
  cut(): this {
    this.feed(4);
    this.parts.push(GS, 0x56, 0x00);
    return this;
  }

  bytes(): Uint8Array {
    return new Uint8Array(this.parts);
  }
}

/** Characters per line, which is what every layout here is measured in. */
export function columnsFor(paperMm: number): number {
  // 58mm rolls fit 32 characters in the default font; 80mm fit 48.
  return paperMm === 80 ? 48 : 32;
}
