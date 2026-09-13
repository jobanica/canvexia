import {
  type Ticket,
  ticketHeaderLines,
  ticketHeading,
  ticketDocLabel,
  ticketBodyLines,
  ticketCustomerLines,
  ticketFooterLines,
} from "./ticket";
import type { ShiftReport } from "./report";

/**
 * Minimal ESC/POS encoder — the de-facto command language of thermal receipt
 * printers. We emit the raw byte stream a printer understands: init, alignment,
 * emphasis, the ticket text, then a paper cut.
 *
 * Pure + dependency-free so it runs anywhere (server for network/cloud
 * transports, browser for Web Bluetooth) and is easy to unit-test.
 */

const ESC = 0x1b;
const GS = 0x1d;

class EscPosBuilder {
  private bytes: number[] = [];

  raw(...b: number[]): this {
    this.bytes.push(...b);
    return this;
  }

  /** Append text as bytes (ASCII/Latin-1; non-encodable chars become '?'). */
  text(s: string): this {
    for (const ch of s) {
      const code = ch.charCodeAt(0);
      this.bytes.push(code <= 0xff ? code : 0x3f);
    }
    return this;
  }

  line(s = ""): this {
    return this.text(s).raw(0x0a);
  }

  init(): this {
    return this.raw(ESC, 0x40); // ESC @
  }
  align(a: "left" | "center" | "right"): this {
    return this.raw(ESC, 0x61, a === "center" ? 1 : a === "right" ? 2 : 0);
  }
  bold(on: boolean): this {
    return this.raw(ESC, 0x45, on ? 1 : 0);
  }
  /** Double width+height when big=true (GS ! n). */
  size(big: boolean): this {
    return this.raw(GS, 0x21, big ? 0x11 : 0x00);
  }
  cut(): this {
    return this.raw(GS, 0x56, 0x00); // GS V 0 — full cut
  }

  /**
   * Pop the cash drawer open.
   *
   * The drawer isn't a separate device: it plugs into the printer's RJ-11 port
   * and opens when the printer sends a pulse down it. So "open the drawer" is a
   * print command, which is why it lives here.
   *
   * ESC p m t1 t2 — pin 2 (m=0), on for t1×2 ms then off. 25/250 is the widely
   * compatible timing; too short a pulse and the solenoid doesn't throw.
   */
  kickDrawer(pin: 0 | 1 = 0): this {
    return this.raw(ESC, 0x70, pin, 0x19, 0xfa);
  }

  /**
   * Native QR code via the GS ( k command family (model 2). Supported by the
   * vast majority of modern thermal printers, and far crisper than a bitmap.
   */
  qr(data: string, moduleSize = 6): this {
    const bytes: number[] = [];
    for (const ch of data) {
      const code = ch.charCodeAt(0);
      bytes.push(code <= 0xff ? code : 0x3f);
    }
    // Function 165 — select model 2
    this.raw(GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00);
    // Function 167 — module size
    this.raw(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, moduleSize);
    // Function 169 — error correction level M
    this.raw(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31);
    // Function 180 — store data in symbol storage area
    const len = bytes.length + 3;
    this.raw(GS, 0x28, 0x6b, len & 0xff, (len >> 8) & 0xff, 0x31, 0x50, 0x30, ...bytes);
    // Function 181 — print the symbol
    this.raw(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30);
    return this;
  }

  build(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

/**
 * Just the drawer pulse, with nothing printed.
 *
 * For settling a sale when receipt printing is turned off: the cashier still
 * needs the drawer, they just don't want the paper.
 */
export function encodeDrawerKick(): Uint8Array {
  return new EscPosBuilder().init().kickDrawer().build();
}

export function encodeDrawerKickBase64(): string {
  return Buffer.from(encodeDrawerKick()).toString("base64");
}

/**
 * Encodes a Ticket into an ESC/POS byte stream ready to send to a printer.
 *
 * `openDrawer` fires the pulse first, before any paper moves, so the drawer is
 * already open by the time the cashier tears the receipt off.
 */
export function encodeTicket(ticket: Ticket, openDrawer = false): Uint8Array {
  const b = new EscPosBuilder().init();
  if (openDrawer) b.kickDrawer();
  b.align("center");

  // Header: restaurant name (bold) + contact lines, then a big table number.
  const header = ticketHeaderLines(ticket);
  b.bold(true).line(header[0]).bold(false);
  for (const line of header.slice(1)) b.line(line);
  b.size(true).line(ticketHeading(ticket)).size(false);
  b.bold(true).line(ticketDocLabel(ticket)).bold(false);

  // Who it's for and where it's going — left-aligned and bold, because this is
  // the block a rider reads at a gate in the dark.
  b.align("left");
  const customer = ticketCustomerLines(ticket);
  if (customer.length) {
    b.bold(true);
    for (const line of customer) b.line(line);
    b.bold(false);
  }

  // Body — order meta, items, totals.
  for (const line of ticketBodyLines(ticket)) b.line(line);

  // Footer — custom thank-you message, centered.
  const footer = ticketFooterLines(ticket);
  if (footer.length) {
    b.align("center").line();
    for (const line of footer) b.line(line);
  }

  // Website QR — scan to order online / view the menu.
  if (ticket.qrUrl) {
    b.align("center").line().line("Scan to order online").qr(ticket.qrUrl);
  }

  b.line().line().cut();
  return b.build();
}

/** Base64 of the ESC/POS stream — convenient for transport over JSON/HTTP. */
export function encodeTicketBase64(ticket: Ticket, openDrawer = false): string {
  return Buffer.from(encodeTicket(ticket, openDrawer)).toString("base64");
}

/**
 * Encodes a non-order report (the end-of-shift Z-report) the same way a receipt
 * is encoded, so it reaches the thermal printer through the identical transport
 * rather than through the browser's print dialog.
 */
export function encodeReport(report: ShiftReport): Uint8Array {
  const b = new EscPosBuilder().init().align("center");

  b.bold(true).line(report.headerLines[0] ?? "").bold(false);
  for (const line of report.headerLines.slice(1)) b.line(line);
  b.size(true).line("SHIFT SUMMARY").size(false);

  b.align("left");
  for (const line of report.bodyLines) b.line(line);

  if (report.footerLines.length) {
    b.align("center").line();
    for (const line of report.footerLines) b.line(line);
  }

  b.line().line().cut();
  return b.build();
}

export function encodeReportBase64(report: ShiftReport): string {
  return Buffer.from(encodeReport(report)).toString("base64");
}
