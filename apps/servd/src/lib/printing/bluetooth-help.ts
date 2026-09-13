/**
 * Turning a Web Bluetooth failure into something a restaurant owner can act on.
 *
 * The browser's own wording is written for developers. "Web Bluetooth API
 * globally disabled" tells a cashier nothing about what to do next, and reads
 * like the app is broken — it isn't; the browser is refusing before we get a
 * chance to ask for a printer.
 *
 * Pure so the mapping can be tested. Both inputs come from the browser, and
 * neither is trustworthy enough to branch on without a default.
 */

export type BluetoothHelp = {
  /** What to tell them. One or two sentences. */
  message: string;
  /** Nothing on this device will work — offer the network printer instead. */
  hopeless: boolean;
};

/** Facebook, Messenger, Instagram, TikTok, Line: browsers inside another app. */
const IN_APP = /(FBAN|FBAV|FB_IAB|Instagram|Messenger|Line\/|TikTok|MicroMessenger)/i;

/**
 * The user cancelling the device chooser is not an error worth showing — they
 * pressed Cancel and know it.
 */
export function isUserCancel(message: string): boolean {
  return /cancel|user (denied|dismissed)|chooser was closed/i.test(message);
}

export function bluetoothHelp(message: string, userAgent = ""): BluetoothHelp {
  // The most common cause by far in practice: the page was opened from inside
  // another app. Those browsers expose navigator.bluetooth and then refuse
  // every call, which is exactly the "globally disabled" message.
  if (IN_APP.test(userAgent)) {
    return {
      message:
        "This page was opened inside another app (Facebook, Messenger, Instagram…), and those can't use Bluetooth. Open it in Chrome instead — tap the ⋯ menu and choose “Open in browser”.",
      hopeless: false,
    };
  }

  if (/globally disabled|blocked by (policy|administrator)|not allowed by policy/i.test(message)) {
    return {
      message:
        "Bluetooth is switched off in this browser. In Chrome go to chrome://flags, search “Bluetooth”, set Web Bluetooth to Enabled and restart the browser. If it's a work device your IT policy may block it, in which case use a Network printer instead.",
      hopeless: false,
    };
  }

  if (/secure context|https|SecurityError/i.test(message)) {
    return {
      message:
        "Bluetooth only works on a secure (https) address. Open the dashboard on its normal https link rather than an IP address.",
      hopeless: false,
    };
  }

  if (/no devices|not found|NotFoundError/i.test(message)) {
    return {
      message:
        "No printer answered. Switch the printer on, make sure it's in pairing mode and within a few metres, then try again.",
      hopeless: false,
    };
  }

  if (/not supported|undefined is not|bluetooth is not/i.test(message)) {
    return {
      message:
        "This device can't pair a Bluetooth printer. Web Bluetooth needs Chrome on Android or a desktop — it never works on iPhone or iPad. Use a Network printer instead.",
      hopeless: true,
    };
  }

  // Anything unrecognised: show what the browser said rather than swallow it,
  // but say what it means for them.
  return {
    message: `Couldn't connect to the printer. ${message}`,
    hopeless: false,
  };
}
