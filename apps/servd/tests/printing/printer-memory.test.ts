import { describe, it, expect } from "vitest";
import { parseRemembered, printerKey } from "@/lib/printing/printer-memory";

/**
 * The reported problem: "printer gets disconnected, then I reconnect again —
 * it should connect only once, then auto-connect every time I open the phone."
 *
 * The pairing never expired. Chrome keeps the device permission for the origin;
 * the PAGE forgot which device it was, because the paired device lived in a
 * module variable that dies on every load. This is the note that survives, and
 * it decides whether the app silently reconnects to a device — so anything that
 * isn't unmistakably a stored printer has to be rejected here rather than fail
 * later, at the till, with a queue waiting.
 */

const good = {
  id: "abc123",
  name: "POS-58",
  serviceUuid: "000018f0-0000-1000-8000-00805f9b34fb",
  charUuid: "00002af1-0000-1000-8000-00805f9b34fb",
};

describe("printerKey", () => {
  it("keeps the two stations apart", () => {
    expect(printerKey("till")).not.toBe(printerKey("kitchen"));
  });
});

describe("parseRemembered", () => {
  it("reads back what was stored", () => {
    expect(parseRemembered(JSON.stringify(good))).toEqual(good);
  });

  it("returns null when nothing was stored", () => {
    expect(parseRemembered(null)).toBeNull();
    expect(parseRemembered(undefined)).toBeNull();
    expect(parseRemembered("")).toBeNull();
  });

  it("survives junk instead of throwing", () => {
    // Site data gets cleared, hand-edited, or half-written by another tab.
    expect(parseRemembered("not json")).toBeNull();
    expect(parseRemembered("[]")).toBeNull();
    expect(parseRemembered("null")).toBeNull();
    expect(parseRemembered('"a string"')).toBeNull();
  });

  it("rejects a record missing the device id", () => {
    // Without an id there is nothing to match against getDevices().
    expect(parseRemembered(JSON.stringify({ ...good, id: undefined }))).toBeNull();
    expect(parseRemembered(JSON.stringify({ ...good, id: "" }))).toBeNull();
    expect(parseRemembered(JSON.stringify({ ...good, id: 42 }))).toBeNull();
  });

  it("rejects a record missing the service or characteristic", () => {
    // An older stored shape. Reconnecting without these would connect and then
    // fail on the first write, which is the worst moment to find out.
    expect(parseRemembered(JSON.stringify({ ...good, serviceUuid: undefined }))).toBeNull();
    expect(parseRemembered(JSON.stringify({ ...good, charUuid: "" }))).toBeNull();
  });

  it("accepts a printer that never reported a name", () => {
    // Plenty of cheap BLE printers advertise no name at all.
    expect(parseRemembered(JSON.stringify({ ...good, name: undefined }))).toEqual({
      ...good,
      name: null,
    });
    expect(parseRemembered(JSON.stringify({ ...good, name: "" }))?.name).toBeNull();
  });
});
