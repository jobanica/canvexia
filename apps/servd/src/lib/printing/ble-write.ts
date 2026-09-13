/**
 * Getting bytes into a Bluetooth thermal printer without losing any.
 *
 * THE BUG THIS EXISTS FOR. Both BLE paths used to do this:
 *
 *     const CHUNK = 200;
 *     for (let i = 0; i < bytes.length; i += CHUNK)
 *       await ch.writeValueWithoutResponse(bytes.slice(i, i + CHUNK));
 *
 * `writeValueWithoutResponse` is fire-and-forget: its promise resolves when the
 * BROWSER has queued the packet, not when the printer has received or processed
 * it. So that loop pushes the whole receipt at the radio as fast as it will
 * take it, the printer's receive buffer overruns, and bytes vanish — at the
 * chunk boundaries, every time.
 *
 * A real 490-byte bill came out of a shop's printer with two holes in it, and
 * they were at byte 200 and byte 400:
 *
 *     --------------------------------ha        249.00   ← lost "⏎1x Biscoff Matc"
 *     ...
 *     Sc                                                  ← cut off mid-"Scan to order online"
 *
 * One item silently missing from a customer's bill, and the total not matching
 * the lines above it.
 *
 * THE FIX, in order of preference:
 *
 *  1. Use `writeValueWithResponse` when the characteristic supports it. The
 *     printer acknowledges each packet, which is actual flow control — the only
 *     thing here that genuinely can't overrun.
 *  2. Otherwise send small packets and pace them, so the printer has time to
 *     drain between writes.
 *
 * And in both cases, wait after the last packet before disconnecting: dropping
 * the link the instant the final write resolves cuts off whatever is still in
 * the buffer, which is the second hole above.
 */

/**
 * Bytes per packet.
 *
 * BLE's default ATT_MTU is 23, leaving 20 bytes of payload, and a characteristic
 * that never negotiated a larger MTU silently truncates anything bigger. Web
 * Bluetooth exposes no way to ask what was negotiated, so the un-acknowledged
 * path has to assume the floor. The acknowledged path can afford more, because
 * each packet is confirmed before the next goes out.
 */
export const CHUNK_UNACKED = 20;
export const CHUNK_ACKED = 180;

/** Pause between un-acknowledged packets, giving the printer time to drain. */
export const PACE_MS = 12;

/**
 * How long to hold the connection open after the last byte.
 *
 * A thermal printer keeps printing from its buffer well after the radio has
 * gone quiet. Disconnecting immediately is what truncated the footer.
 */
export const DRAIN_MS = 600;

/** The slice of a characteristic this needs — kept narrow so it's easy to fake. */
export interface WritableCharacteristic {
  properties?: { write?: boolean; writeWithoutResponse?: boolean };
  writeValueWithResponse?: (value: Uint8Array) => Promise<void>;
  writeValueWithoutResponse?: (value: Uint8Array) => Promise<void>;
  writeValue?: (value: Uint8Array) => Promise<void>;
}

/** Split a stream into packets of at most `size` bytes. */
export function chunkBytes(bytes: Uint8Array, size: number): Uint8Array[] {
  const out: Uint8Array[] = [];
  const step = Math.max(1, Math.floor(size));
  for (let i = 0; i < bytes.length; i += step) out.push(bytes.slice(i, i + step));
  return out;
}

/**
 * Can this characteristic acknowledge writes?
 *
 * Preferred when available: an acknowledged write is the difference between
 * "the browser sent it" and "the printer has it".
 */
export function supportsAckedWrite(ch: WritableCharacteristic): boolean {
  if (typeof ch.writeValueWithResponse !== "function") return false;
  // Older implementations expose no `properties`; try the acked path anyway,
  // since the failure is caught and retried below.
  return ch.properties?.write !== false;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Send the whole stream, packet by packet, without overrunning the printer.
 *
 * Falls back from acknowledged to paced un-acknowledged writes if the printer
 * rejects the former — some cheap modules advertise WRITE and then refuse it.
 */
export async function writeToPrinter(
  ch: WritableCharacteristic,
  bytes: Uint8Array,
  opts: { sleepFn?: (ms: number) => Promise<void> } = {},
): Promise<void> {
  const wait = opts.sleepFn ?? sleep;

  if (supportsAckedWrite(ch)) {
    try {
      for (const packet of chunkBytes(bytes, CHUNK_ACKED)) {
        await ch.writeValueWithResponse!(packet);
      }
      await wait(DRAIN_MS);
      return;
    } catch {
      // Advertised it, wouldn't do it. Fall through and pace instead.
    }
  }

  const write =
    ch.writeValueWithoutResponse?.bind(ch) ?? ch.writeValue?.bind(ch);
  if (!write) throw new Error("This printer doesn't accept writes.");

  const packets = chunkBytes(bytes, CHUNK_UNACKED);
  for (let i = 0; i < packets.length; i++) {
    await write(packets[i]);
    // No pause after the last packet — the drain wait below covers it.
    if (i < packets.length - 1) await wait(PACE_MS);
  }
  await wait(DRAIN_MS);
}
