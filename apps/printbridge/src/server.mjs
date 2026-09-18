import { timingSafeEqual } from "node:crypto";
import { printBytes, listPrinters } from "./printers.mjs";
import { saveConfig } from "./config.mjs";

/**
 * A LOCALHOST PRINT SERVER, and the reasons it is safe to run one.
 *
 * Any page the cashier opens can reach 127.0.0.1. The browser will not let a
 * foreign origin READ this server's replies, but a plain POST still fires — so
 * "it is only on localhost" is not a security model. Three things are:
 *
 *   1. BOUND TO 127.0.0.1. Nothing on the shop's Wi-Fi can see it, so a
 *      customer on the guest network cannot print.
 *   2. THE ORIGIN IS CHECKED against a list, and CORS is answered for exactly
 *      that list.
 *   3. A SECRET IS REQUIRED on every print. This is the one that actually
 *      holds: a page that does not know the token cannot print, wherever it is
 *      served from and whatever it claims its origin is.
 *
 * The worst case if all three fail is wasted paper — it prints, it does not
 * read anything back. Worth defending anyway, because a roll of paper at 3am
 * is how somebody learns their till is reachable.
 */

const MAX_BYTES = 512 * 1024;

function sameSecret(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  // Compare in constant time, and only after the lengths match — timingSafeEqual
  // throws on a mismatch, which would itself leak the length.
  return x.length === y.length && timingSafeEqual(x, y);
}

function cors(res, origin, allowed) {
  if (origin && allowed.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "content-type, x-print-token");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  }
}

function json(res, code, body) {
  // The client may already be gone — an aborted upload, a closed tab. Writing
  // to a dead socket throws, and an unhandled throw here would take the whole
  // bridge down mid-shift.
  if (res.writableEnded || res.destroyed) return;
  try {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  } catch {
    /* nobody is listening */
  }
}

/**
 * Read the body, refusing anything absurd.
 *
 * A receipt is a couple of kilobytes. Past the cap the rest of the upload is
 * DRAINED AND DISCARDED rather than the socket being destroyed: killing the
 * connection takes away the path the refusal has to travel on, and the caller
 * sees a hang that looks exactly like a dead bridge.
 *
 * The caller may still see a connection error instead of the 413 — it is
 * mid-upload when the refusal is written, and that race belongs to HTTP, not to
 * this code. Either way the bytes are not printed, which is the rule that
 * matters.
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooBig = false;
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BYTES) {
        tooBig = true;
        chunks.length = 0;
        return;
      }
      if (!tooBig) chunks.push(c);
    });
    req.on("end", () =>
      tooBig ? reject(new Error("too large")) : resolve(Buffer.concat(chunks)),
    );
    // A client that goes away mid-upload is not an error worth reporting: there
    // is nobody left to report it to.
    req.on("error", () => reject(new Error("upload failed")));
  });
}

export function handler(config) {
  return async (req, res) => {
    const origin = req.headers.origin ?? "";
    const allowed = config.origins;
    cors(res, origin, allowed);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      return res.end();
    }

    const url = new URL(req.url ?? "/", "http://127.0.0.1");

    /*
      `/status` CARRIES NO SECRET AND NEEDS NONE. It answers "a bridge is
      running here" and nothing else — no printer name, no token — so the
      settings page can say "found it" before anybody has pasted anything.
    */
    if (req.method === "GET" && url.pathname === "/status") {
      return json(res, 200, { ok: true, service: "resceta-printbridge", version: 1 });
    }

    if (req.method === "GET" && url.pathname === "/printers") {
      if (!sameSecret(req.headers["x-print-token"] ?? "", config.token)) {
        return json(res, 401, { ok: false, error: "Wrong or missing token." });
      }
      return json(res, 200, { ok: true, printers: await listPrinters() });
    }

    if (req.method === "POST" && url.pathname === "/print") {
      if (origin && !allowed.includes(origin)) {
        return json(res, 403, { ok: false, error: "That origin may not print here." });
      }
      if (!sameSecret(req.headers["x-print-token"] ?? "", config.token)) {
        return json(res, 401, { ok: false, error: "Wrong or missing token." });
      }
      let body;
      try {
        body = await readBody(req);
      } catch {
        return json(res, 413, { ok: false, error: "That document is too large." });
      }
      if (body.length === 0) {
        return json(res, 400, { ok: false, error: "Nothing to print." });
      }
      try {
        await printBytes(body, config);
        return json(res, 200, { ok: true, bytes: body.length });
      } catch (e) {
        // The real reason, because the person reading it is standing next to
        // the printer and is the only one who can fix it.
        return json(res, 500, { ok: false, error: e?.message || "The printer refused it." });
      }
    }

    if (req.method === "POST" && url.pathname === "/settings") {
      if (!sameSecret(req.headers["x-print-token"] ?? "", config.token)) {
        return json(res, 401, { ok: false, error: "Wrong or missing token." });
      }
      let body;
      try {
        body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
      } catch {
        return json(res, 400, { ok: false, error: "That was not settings." });
      }
      // Only the fields that are settings. The token is never taken from a
      // request — it is the thing being proved, not something to overwrite.
      for (const key of ["target", "host", "tcpPort", "printer"]) {
        if (key in body) config[key] = body[key];
      }
      saveConfig(config);
      return json(res, 200, { ok: true });
    }

    return json(res, 404, { ok: false, error: "No such endpoint." });
  };
}
