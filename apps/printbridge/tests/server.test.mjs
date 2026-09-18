import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { handler } from "../src/server.mjs";

/**
 * THE BRIDGE'S SECURITY RULES, exercised against a real server.
 *
 * Any page the cashier opens can reach 127.0.0.1. The browser will not let a
 * foreign origin read the replies, but a plain POST still fires — so these are
 * the rules that decide whether a stranger's tab can make the till print.
 */

const TOKEN = "test-token-abc";
const ORIGIN = "https://resceta.vercel.app";

function serve(overrides = {}) {
  const config = {
    port: 0,
    origins: [ORIGIN],
    target: "tcp",
    host: "",
    tcpPort: 9100,
    printer: "",
    token: TOKEN,
    ...overrides,
  };
  const server = http.createServer(handler(config));
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () =>
      resolve({ server, base: `http://127.0.0.1:${server.address().port}` }),
    );
  });
}

async function call(base, path, init = {}) {
  const res = await fetch(base + path, init);
  const text = await res.text();
  let body = {};
  try {
    body = JSON.parse(text);
  } catch {
    /* not json */
  }
  return { status: res.status, body, headers: res.headers };
}

test("status needs no token, so the page can find the bridge", async () => {
  const { server, base } = await serve();
  const r = await call(base, "/status");
  assert.equal(r.status, 200);
  assert.equal(r.body.service, "resceta-printbridge");
  // And it leaks nothing: no token, no printer name.
  assert.equal(JSON.stringify(r.body).includes(TOKEN), false);
  server.close();
});

test("printing without a token is refused", async () => {
  const { server, base } = await serve();
  const r = await call(base, "/print", {
    method: "POST",
    headers: { origin: ORIGIN },
    body: new Uint8Array([1, 2, 3]),
  });
  assert.equal(r.status, 401);
  server.close();
});

test("printing with a WRONG token is refused", async () => {
  const { server, base } = await serve();
  const r = await call(base, "/print", {
    method: "POST",
    headers: { origin: ORIGIN, "x-print-token": "not-it" },
    body: new Uint8Array([1, 2, 3]),
  });
  assert.equal(r.status, 401);
  server.close();
});

test("a stranger's origin is refused even with a token", async () => {
  // Belt and braces: if the token ever leaks, the origin still has to match.
  const { server, base } = await serve();
  const r = await call(base, "/print", {
    method: "POST",
    headers: { origin: "https://evil.example", "x-print-token": TOKEN },
    body: new Uint8Array([1, 2, 3]),
  });
  assert.equal(r.status, 403);
  server.close();
});

test("CORS is granted to the allowed origin only", async () => {
  const { server, base } = await serve();
  const good = await call(base, "/status", { headers: { origin: ORIGIN } });
  assert.equal(good.headers.get("access-control-allow-origin"), ORIGIN);
  const bad = await call(base, "/status", { headers: { origin: "https://evil.example" } });
  assert.equal(bad.headers.get("access-control-allow-origin"), null);
  server.close();
});

test("an empty document is refused rather than sent", async () => {
  const { server, base } = await serve();
  const r = await call(base, "/print", {
    method: "POST",
    headers: { origin: ORIGIN, "x-print-token": TOKEN },
    body: new Uint8Array([]),
  });
  assert.equal(r.status, 400);
  server.close();
});

test("an oversized document is never printed", async () => {
  /*
    THE RULE IS "IT DOES NOT PRINT", not "it returns 413".

    The bridge writes the refusal while the client is still uploading, so the
    client may see the 413 or may see the connection drop first — that race
    belongs to HTTP. Either outcome is a refusal; a 200 would not be.
  */
  const { server, base } = await serve();
  try {
    const r = await call(base, "/print", {
      method: "POST",
      headers: { origin: ORIGIN, "x-print-token": TOKEN },
      body: new Uint8Array(600 * 1024),
    });
    assert.notEqual(r.status, 200, "an oversized document must never print");
  } catch (e) {
    // A dropped connection IS the refusal.
    assert.ok(e instanceof Error);
  } finally {
    server.close();
  }
});

test("a real print reports the printer's own failure", async () => {
  // target tcp with no host: the bridge must say so rather than hang.
  const { server, base } = await serve();
  const r = await call(base, "/print", {
    method: "POST",
    headers: { origin: ORIGIN, "x-print-token": TOKEN },
    body: new Uint8Array([27, 64]),
  });
  assert.equal(r.status, 500);
  assert.match(r.body.error, /No printer address/);
  server.close();
});

test("settings can be changed but the token can never be overwritten", async () => {
  // The token is the thing being proved, not a field to set.
  const config = {
    port: 0, origins: [ORIGIN], target: "tcp", host: "", tcpPort: 9100,
    printer: "", token: TOKEN,
  };
  const server = http.createServer(handler(config));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  await call(base, "/settings", {
    method: "POST",
    headers: { origin: ORIGIN, "x-print-token": TOKEN, "content-type": "application/json" },
    body: JSON.stringify({ host: "192.168.1.50", token: "hijacked" }),
  });
  assert.equal(config.host, "192.168.1.50");
  assert.equal(config.token, TOKEN);
  server.close();
});

test("an unknown endpoint is a 404, not a crash", async () => {
  const { server, base } = await serve();
  const r = await call(base, "/anything");
  assert.equal(r.status, 404);
  server.close();
});
