/**
 * TALKING TO THE PRINTER ATTACHED TO THIS TILL.
 *
 * REPORTED — "is it via usb or via bluetooth."
 *
 * Three ways to print, and the choice belongs to THIS DEVICE, not to the
 * pharmacy. A shop with a laptop at the front counter and a tablet at the back
 * has two printers connected two different ways; a single setting in the
 * database would force them to agree and one of them would be wrong.
 *
 *   dialog    — the browser's own print dialog, to whatever printer the
 *               operating system has. Works everywhere, needs a human.
 *   bluetooth — Web Bluetooth straight to the printer. No dialog.
 *   usb       — WebUSB straight to the printer. No dialog.
 *
 * WHAT IS NOT AVAILABLE IS SAID, NOT HIDDEN. Web Bluetooth and WebUSB do not
 * exist in Safari, which is every iPhone and iPad. Offering a button that can
 * never work is worse than saying the browser cannot do it — so `support()`
 * asks the browser rather than guessing from the user agent.
 */

export type PrintMethod = "dialog" | "bluetooth" | "usb";

const STORE = "resceta_print_method";

export function savedMethod(): PrintMethod {
  if (typeof window === "undefined") return "dialog";
  try {
    const v = window.localStorage.getItem(STORE);
    return v === "bluetooth" || v === "usb" ? v : "dialog";
  } catch {
    // Private browsing, blocked storage. The dialog always works.
    return "dialog";
  }
}

export function saveMethod(m: PrintMethod): void {
  try {
    window.localStorage.setItem(STORE, m);
  } catch {
    /* the choice just will not be remembered */
  }
}

export interface Support {
  bluetooth: boolean;
  usb: boolean;
  /** Both direct paths need a secure context, which localhost also satisfies. */
  secure: boolean;
}

export function support(): Support {
  if (typeof navigator === "undefined") {
    return { bluetooth: false, usb: false, secure: false };
  }
  const nav = navigator as Navigator & { bluetooth?: unknown; usb?: unknown };
  return {
    bluetooth: typeof nav.bluetooth !== "undefined",
    usb: typeof nav.usb !== "undefined",
    secure: typeof window !== "undefined" ? window.isSecureContext : false,
  };
}

/*
  The serial-over-Bluetooth service the cheap thermal printers use. Several
  vendor ids are in circulation for what is the same chipset, so all of the
  common ones are offered rather than making somebody identify their printer.
*/
const BT_SERVICES = [
  0x18f0, // most ESC/POS rolls sold here
  0xff00,
  0xffe0,
  0xae30,
];

interface BtLike {
  requestDevice(o: unknown): Promise<BtDevice>;
  getDevices?: () => Promise<BtDevice[]>;
}
interface BtDevice {
  name?: string | null;
  gatt?: {
    connected: boolean;
    connect(): Promise<BtServer>;
  };
}
interface BtServer {
  getPrimaryServices(): Promise<BtService[]>;
}
interface BtService {
  getCharacteristics(): Promise<BtChar[]>;
}
interface BtChar {
  properties: { write: boolean; writeWithoutResponse: boolean };
  writeValueWithoutResponse?: (d: ArrayBufferView | ArrayBuffer) => Promise<void>;
  writeValue?: (d: ArrayBufferView | ArrayBuffer) => Promise<void>;
}

export interface Connection {
  name: string;
  send(bytes: Uint8Array): Promise<void>;
}

/**
 * MUST BE CALLED FROM A CLICK. Both browser APIs refuse outside a user gesture,
 * and the refusal looks exactly like a broken printer.
 */
export async function connectBluetooth(): Promise<Connection> {
  const nav = navigator as Navigator & { bluetooth?: BtLike };
  if (!nav.bluetooth) throw new Error("This browser cannot use Bluetooth printers.");

  const device = await nav.bluetooth.requestDevice({
    filters: BT_SERVICES.map((s) => ({ services: [s] })),
    optionalServices: BT_SERVICES,
  });
  const server = await device.gatt?.connect();
  if (!server) throw new Error("Could not connect to that printer.");

  // Find something writable rather than assuming a characteristic id: the same
  // service carries different ones across these vendors.
  for (const service of await server.getPrimaryServices()) {
    for (const ch of await service.getCharacteristics()) {
      if (!ch.properties.write && !ch.properties.writeWithoutResponse) continue;
      return {
        name: device.name || "Bluetooth printer",
        async send(bytes) {
          /*
            IN CHUNKS. A BLE characteristic write is capped near 512 bytes and
            most of these printers stall well before that; a whole receipt in
            one write prints the first few lines and silently stops.
          */
          const SIZE = 180;
          for (let i = 0; i < bytes.length; i += SIZE) {
            const part = bytes.slice(i, i + SIZE);
            if (ch.writeValueWithoutResponse) await ch.writeValueWithoutResponse(part);
            else if (ch.writeValue) await ch.writeValue(part);
            // The printer has no flow control worth the name. A short pause
            // between chunks is the difference between a receipt and half of
            // one.
            await new Promise((r) => setTimeout(r, 20));
          }
        },
      };
    }
  }
  throw new Error("That device has no printable channel.");
}

interface UsbLike {
  requestDevice(o: unknown): Promise<UsbDevice>;
}
interface UsbDevice {
  productName?: string | null;
  manufacturerName?: string | null;
  opened: boolean;
  configuration: { interfaces: UsbInterface[] } | null;
  open(): Promise<void>;
  selectConfiguration(n: number): Promise<void>;
  claimInterface(n: number): Promise<void>;
  transferOut(endpoint: number, data: ArrayBufferView | ArrayBuffer): Promise<unknown>;
}
interface UsbInterface {
  interfaceNumber: number;
  alternate: { endpoints: { direction: string; endpointNumber: number }[] };
}

export async function connectUsb(): Promise<Connection> {
  const nav = navigator as Navigator & { usb?: UsbLike };
  if (!nav.usb) throw new Error("This browser cannot use USB printers.");

  // Class 7 is the USB printer class — the filter every ESC/POS printer matches.
  const device = await nav.usb.requestDevice({ filters: [{ classCode: 7 }] });
  if (!device.opened) await device.open();
  if (!device.configuration) await device.selectConfiguration(1);

  const iface = device.configuration?.interfaces?.[0];
  if (!iface) throw new Error("That printer exposes no interface.");
  await device.claimInterface(iface.interfaceNumber);

  const out = iface.alternate.endpoints.find((e) => e.direction === "out");
  if (!out) throw new Error("That printer has no channel to send to.");

  return {
    name: device.productName || device.manufacturerName || "USB printer",
    async send(bytes) {
      await device.transferOut(out.endpointNumber, bytes);
    },
  };
}

export async function connect(method: PrintMethod): Promise<Connection> {
  if (method === "bluetooth") return connectBluetooth();
  if (method === "usb") return connectUsb();
  throw new Error("The print dialog needs no connection.");
}
