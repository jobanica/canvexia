# Resceta print bridge

A small program that runs on the till and prints Resceta receipts on the
printer attached to that computer — **with no print dialog**.

You do not need this. Resceta prints without it, either through the browser's
print dialog or straight to a Bluetooth or USB printer from Chrome. Use the
bridge when you want the receipt to come out **on its own** the moment a sale
completes, with nobody pressing anything.

## Why it exists

A web page cannot reach a printer without a person's say-so. Chrome will talk
to a Bluetooth or USB printer, but only from a click — a finished sale is not a
click, and the browser cannot tell one from a page helping itself to the
hardware. That is a sensible rule and it costs one tap per sale.

This bridge runs outside the browser, so the rule does not apply to it. Resceta
sends it the receipt and it prints.

## Running it

You need [Node.js](https://nodejs.org) 18 or newer on the till.

```
node src/index.mjs
```

It prints its address and a **token**, and keeps running. Leave the window open
while the shop is trading.

```
  Address:  http://127.0.0.1:9110
  Token:    abc123...
```

In Resceta: **Settings → How this till reaches its printer → Helper app**, and
paste the token in.

## Choosing the printer

Settings live in `~/.resceta/printbridge.json` (Windows:
`C:\Users\<you>\.resceta\printbridge.json`). Edit it and restart.

### `"target": "system"` — a USB or Bluetooth printer

The operating system already knows about the printer once it is installed or
paired, so one setting covers both.

**macOS and Linux.** Set `printer` to the queue name from `lpstat -e`. Leave it
empty to use the default printer.

```json
{ "target": "system", "printer": "POS-58" }
```

**Windows.** Raw printing without extra software means going through a *share*,
so the printer must be shared:

1. Settings → Bluetooth & devices → Printers → your printer → Printer
   properties → **Sharing** → Share this printer. Give it a **short share name
   with no spaces**, e.g. `POS58`.
2. Put that **share name** in the config — not the printer's display name.

```json
{ "target": "system", "printer": "POS58" }
```

> If you get `The network name cannot be found`, the share name is wrong or the
> printer is not shared. That is the usual cause.

### `"target": "tcp"` — a network printer

For a thermal printer with an ethernet or Wi-Fi socket. Port 9100 is the raw
port nearly all of them listen on.

```json
{ "target": "tcp", "host": "192.168.1.50", "tcpPort": 9100 }
```

## Is it safe to run a server on the till?

It is worth being straight about this, because "it is only on localhost" is not
a security model — any page the cashier opens can reach `127.0.0.1`.

Three things protect it:

1. **It listens on `127.0.0.1` only.** Nothing else on the shop's Wi-Fi can see
   it, so a customer on the guest network cannot reach it at all.
2. **Only the configured origins may print** — Resceta itself, and nothing else.
3. **Every print must carry the token.** A page that does not know it cannot
   print, wherever it is served from.

The worst case if all three somehow failed is wasted paper: the bridge prints,
it does not read your data or send anything anywhere. It makes no outbound
connections except to the printer you configured.

Treat the token like a password. It lives in that config file with `0600`
permissions. If you think it has leaked, delete the `token` line and restart —
a new one is generated, and the old one stops working.

## Keeping it running

Nothing here installs a service, on purpose: a pharmacy should be able to see
what is running and close it. If you want it to start with the computer:

- **Windows** — make a shortcut to `node src\index.mjs` and put it in
  `shell:startup`.
- **macOS** — a `launchd` plist, or just add it to Login Items via a small
  `.command` file.
- **Linux** — a `systemd --user` unit.

## Tests

```
npm test
```

They run a real bridge, a fake printer on a socket, and check what actually
comes out the other end — including that an unauthorised page cannot print.
