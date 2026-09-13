import { describe, it, expect } from "vitest";
import {
  CHUNK_ACKED,
  CHUNK_UNACKED,
  chunkBytes,
  supportsAckedWrite,
  writeToPrinter,
  type WritableCharacteristic,
} from "@/lib/printing/ble-write";
import { buildTicket } from "@/lib/printing/ticket";
import { encodeTicket } from "@/lib/printing/escpos";

/**
 * A shop's ₱488 bill printed with two holes in it, and they were exactly at the
 * old 200-byte chunk boundaries:
 *
 *   byte 200 → "1x Biscoff|" " Matcha  249.00"   printed as "-----ha   249.00"
 *   byte 400 → "Sc|an to order online"           printed as "Sc" and stopped
 *
 * One item silently missing from a customer's bill, with a total that didn't
 * match the lines above it. The cause was writeValueWithoutResponse being
 * fire-and-forget: it resolves when the BROWSER queues the packet, so the loop
 * outran the printer's buffer.
 */

/** A printer that records everything it is actually handed. */
function fakePrinter(opts: { acked?: boolean; refuseAcked?: boolean } = {}) {
  const received: number[] = [];
  const packets: number[] = [];
  const ch: WritableCharacteristic = {
    properties: { write: opts.acked ?? false, writeWithoutResponse: true },
    writeValueWithoutResponse: async (v: Uint8Array) => {
      packets.push(v.length);
      received.push(...v);
    },
  };
  if (opts.acked) {
    ch.writeValueWithResponse = async (v: Uint8Array) => {
      if (opts.refuseAcked) throw new Error("GATT operation not permitted");
      packets.push(v.length);
      received.push(...v);
    };
  }
  return { ch, received, packets };
}

const noSleep = async () => {};

/** The real bill from the report, rebuilt byte for byte. */
function theBill(): Uint8Array {
  return encodeTicket(
    buildTicket({
      kind: "bill",
      restaurantName: "Dr. Coffee - Kalibo",
      address: "QT Building, Poblacion, Kalibo, Aklan",
      phone: "09681964960",
      footer: "Your daily dose of remedy.",
      showVat: false,
      orderType: "dine_in",
      tableNumber: "#011",
      orderId: "adfabf0b-1111",
      createdAt: "2026-08-17T18:09:48.000Z",
      total: 48_800,
      qrUrl: "https://servdph.com/r/dr-coffee-kalibo",
      items: [
        { quantity: 1, name: "Biscoff Matcha", modifiers: [], lineTotal: 24_900 },
        { quantity: 1, name: "Katsu Silog", modifiers: [], lineTotal: 23_900 },
      ],
    }),
  );
}

const asText = (b: number[]) => String.fromCharCode(...b);

describe("the reported bill", () => {
  it("is long enough to cross the boundaries that ate it", () => {
    expect(theBill().length).toBeGreaterThan(400);
  });

  it("arrives complete, every byte, in order", async () => {
    const bill = theBill();
    const { ch, received } = fakePrinter();
    await writeToPrinter(ch, bill, { sleepFn: noSleep });
    expect(received.length).toBe(bill.length);
    expect(received).toEqual([...bill]);
  });

  // The two lines the shop actually lost.
  it("delivers the item that went missing", async () => {
    const { ch, received } = fakePrinter();
    await writeToPrinter(ch, theBill(), { sleepFn: noSleep });
    const text = asText(received);
    expect(text).toContain("1x Biscoff Matcha");
    expect(text).toContain("1x Katsu Silog");
  });

  it("delivers the footer that was cut off mid-word", async () => {
    const { ch, received } = fakePrinter();
    await writeToPrinter(ch, theBill(), { sleepFn: noSleep });
    expect(asText(received)).toContain("Scan to order online");
  });

  it("arrives complete over an acknowledging printer too", async () => {
    const bill = theBill();
    const { ch, received } = fakePrinter({ acked: true });
    await writeToPrinter(ch, bill, { sleepFn: noSleep });
    expect(received).toEqual([...bill]);
  });

  // Some cheap modules advertise WRITE and then refuse it.
  it("falls back to paced writes when the printer refuses to acknowledge", async () => {
    const bill = theBill();
    const { ch, received } = fakePrinter({ acked: true, refuseAcked: true });
    await writeToPrinter(ch, bill, { sleepFn: noSleep });
    expect(received).toEqual([...bill]);
  });
});

describe("packet size", () => {
  // BLE's default ATT_MTU leaves 20 bytes of payload, and Web Bluetooth gives
  // no way to ask what was negotiated — so the un-acked path assumes the floor.
  it("never exceeds the safe payload without acknowledgement", async () => {
    const { ch, packets } = fakePrinter();
    await writeToPrinter(ch, theBill(), { sleepFn: noSleep });
    expect(Math.max(...packets)).toBeLessThanOrEqual(CHUNK_UNACKED);
    expect(CHUNK_UNACKED).toBeLessThanOrEqual(20);
  });

  it("sends bigger packets when each one is confirmed", async () => {
    const { ch, packets } = fakePrinter({ acked: true });
    await writeToPrinter(ch, theBill(), { sleepFn: noSleep });
    expect(Math.max(...packets)).toBeLessThanOrEqual(CHUNK_ACKED);
    expect(Math.max(...packets)).toBeGreaterThan(CHUNK_UNACKED);
  });
});

describe("chunkBytes", () => {
  it("covers the whole stream with nothing dropped or repeated", () => {
    const src = Uint8Array.from({ length: 490 }, (_, i) => i % 251);
    const rejoined = chunkBytes(src, 20).flatMap((c) => [...c]);
    expect(rejoined).toEqual([...src]);
  });

  it("handles a stream shorter than one packet", () => {
    expect(chunkBytes(Uint8Array.from([1, 2, 3]), 20)).toHaveLength(1);
  });

  it("handles an empty stream", () => {
    expect(chunkBytes(new Uint8Array(0), 20)).toEqual([]);
  });

  it("refuses a zero size rather than looping forever", () => {
    expect(chunkBytes(Uint8Array.from([1, 2]), 0)).toHaveLength(2);
  });
});

describe("choosing how to write", () => {
  it("prefers acknowledged writes when they're offered", () => {
    expect(supportsAckedWrite(fakePrinter({ acked: true }).ch)).toBe(true);
  });

  it("doesn't when the characteristic can't", () => {
    expect(supportsAckedWrite(fakePrinter().ch)).toBe(false);
  });

  it("says so plainly when a printer accepts no writes at all", async () => {
    await expect(writeToPrinter({}, theBill(), { sleepFn: noSleep })).rejects.toThrow(
      /doesn't accept writes/i,
    );
  });
});

/**
 * The regression itself: the old loop, reproduced against a printer that drops
 * whatever overruns its buffer. It must lose bytes — otherwise this test isn't
 * modelling the fault that was actually observed.
 */
describe("the old loop, for comparison", () => {
  it("loses bytes at the boundaries the receipt lost them at", async () => {
    const bill = theBill();
    // A printer with a small buffer that silently discards an oversized packet,
    // which is what a never-negotiated 23-byte ATT_MTU does.
    const received: number[] = [];
    const overrunPrinter = async (v: Uint8Array) => {
      received.push(...v.slice(0, CHUNK_UNACKED));
    };
    for (let i = 0; i < bill.length; i += 200) {
      await overrunPrinter(bill.slice(i, i + 200));
    }
    expect(received.length).toBeLessThan(bill.length);
    expect(asText(received)).not.toContain("1x Biscoff Matcha");
  });
});
