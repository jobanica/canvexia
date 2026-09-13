import { describe, it, expect } from "vitest";
import { bluetoothHelp, isUserCancel } from "@/lib/printing/bluetooth-help";

/**
 * A cashier tapped "Connect printer" and got "Web Bluetooth API globally
 * disabled." — the browser's own wording, written for developers. It reads as
 * the app being broken, when in fact the browser refused before we ever got to
 * ask for a printer.
 */

const FB_UA =
  "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/440.0;]";
const CHROME_UA =
  "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36";

describe("bluetoothHelp", () => {
  it("blames the in-app browser first — the usual cause", () => {
    // A link opened from Messenger runs in a browser that exposes
    // navigator.bluetooth and then refuses every call.
    const h = bluetoothHelp("Web Bluetooth API globally disabled.", FB_UA);
    expect(h.message).toMatch(/opened inside another app/i);
    expect(h.message).toMatch(/Chrome/);
    expect(h.hopeless).toBe(false);
  });

  it("explains the same message as a browser setting in real Chrome", () => {
    const h = bluetoothHelp("Web Bluetooth API globally disabled.", CHROME_UA);
    expect(h.message).toMatch(/chrome:\/\/flags/);
    expect(h.message).toMatch(/Network printer/i);
  });

  it("never shows the raw developer wording", () => {
    for (const ua of [FB_UA, CHROME_UA]) {
      expect(bluetoothHelp("Web Bluetooth API globally disabled.", ua).message).not.toContain(
        "API globally disabled",
      );
    }
  });

  it("points an unsupported device at a network printer, and says so", () => {
    const h = bluetoothHelp("bluetooth is not supported", CHROME_UA);
    expect(h.hopeless).toBe(true);
    expect(h.message).toMatch(/Network printer/i);
  });

  it("tells them to switch the printer on when nothing answered", () => {
    expect(bluetoothHelp("NotFoundError: No devices found", CHROME_UA).message).toMatch(
      /pairing mode/i,
    );
  });

  it("names https when the page isn't on a secure origin", () => {
    expect(bluetoothHelp("SecurityError: requires a secure context", CHROME_UA).message).toMatch(
      /https/i,
    );
  });

  it("passes an unknown failure through rather than swallowing it", () => {
    // Hiding an error we don't recognise leaves nothing to debug from.
    const h = bluetoothHelp("GATT operation failed for unknown reason", CHROME_UA);
    expect(h.message).toContain("GATT operation failed");
  });

  it("copes with no user agent at all", () => {
    expect(bluetoothHelp("Web Bluetooth API globally disabled.").message).toMatch(/chrome:\/\/flags/);
  });
});

describe("isUserCancel", () => {
  it("recognises the chooser being dismissed", () => {
    expect(isUserCancel("User cancelled the requestDevice() chooser.")).toBe(true);
    expect(isUserCancel("NotFoundError: User cancelled")).toBe(true);
  });

  it("does not swallow a real failure that merely mentions a user", () => {
    expect(isUserCancel("Web Bluetooth API globally disabled.")).toBe(false);
  });
});
