import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import { handler } from "../src/server.mjs";

/**
 * END TO END, against a FAKE PRINTER.
 *
 * A socket on 127.0.0.1 that records what it is sent is exactly what a network
 * thermal printer looks like from here — port 9100, raw bytes, no protocol. So
 * this proves the whole path: a POST arrives, the bytes come out the other end
 * unchanged, and the caller is told it worked.
 */

const TOKEN = "T";
const ORIGIN = "https://resceta.vercel.app";

test("bytes arrive at the printer unchanged, and the caller is told", async () => {
  const received = [];
  const printer = net.createServer((socket) => {
    socket.on("data", (d) => received.push(d));
  });
  await new Promise((r) => printer.listen(0, "127.0.0.1", r));
  const printerPort = printer.address().port;

  const config = {
    port: 0,
    origins: [ORIGIN],
    target: "tcp",
    host: "127.0.0.1",
    tcpPort: printerPort,
    printer: "",
    token: TOKEN,
  };
  const bridge = http.createServer(handler(config));
  await new Promise((r) => bridge.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${bridge.address().port}`;

  // ESC @ then "HELLO" — an init and some text, as a real receipt begins.
  const doc = new Uint8Array([0x1b, 0x40, 72, 69, 76, 76, 79]);
  const res = await fetch(`${base}/print`, {
    method: "POST",
    headers: { origin: ORIGIN, "x-print-token": TOKEN },
    body: doc,
  });
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.bytes, doc.length);

  // Give the socket a moment to flush before reading what landed.
  await new Promise((r) => setTimeout(r, 50));
  const got = Buffer.concat(received);
  assert.deepEqual(Array.from(got), Array.from(doc), "the printer got different bytes");

  bridge.close();
  printer.close();
});

test("a printer that is switched off is reported, not waited on forever", async () => {
  /*
    A printer that is off answers NOTHING — it does not refuse the connection.
    Without a timeout the till would hang on a sale that has already completed,
    which is the worst moment to hang.
  */
  const config = {
    port: 0,
    origins: [ORIGIN],
    // 203.0.113.0/24 is reserved for documentation and routes nowhere, so this
    // behaves like a printer that is plugged in but switched off.
    target: "tcp",
    host: "203.0.113.1",
    tcpPort: 9100,
    printer: "",
    token: TOKEN,
  };
  const bridge = http.createServer(handler(config));
  await new Promise((r) => bridge.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${bridge.address().port}`;

  const started = Date.now();
  const res = await fetch(`${base}/print`, {
    method: "POST",
    headers: { origin: ORIGIN, "x-print-token": TOKEN },
    body: new Uint8Array([0x1b, 0x40]),
  });
  const took = Date.now() - started;
  const body = await res.json();

  assert.equal(res.status, 500);
  assert.equal(body.ok, false);
  // The 5s cap, with room for a slow machine — but nothing like forever.
  assert.ok(took < 15000, `waited ${took}ms`);

  bridge.close();
});
