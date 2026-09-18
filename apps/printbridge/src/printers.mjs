import { spawn } from "node:child_process";
import net from "node:net";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

/**
 * GETTING BYTES TO THE PRINTER, two ways, with NO DEPENDENCIES.
 *
 * A pharmacy in Davao should be able to run this with nothing but Node
 * installed. Every npm package that talks to USB directly needs a native build
 * step, which on a Windows till means installing a C++ toolchain — so neither
 * way below uses one.
 *
 *   system — hand the bytes to the operating system's own print queue. A USB
 *            or Bluetooth printer IS a system printer once it is installed or
 *            paired, which is how one target covers both.
 *   tcp    — straight at a network printer on port 9100, the raw port every
 *            ESC/POS printer with an ethernet or Wi-Fi socket listens on.
 */

/** Windows needs a file on disk; the others can be piped. */
async function withTempFile(bytes, fn) {
  const path = join(tmpdir(), `resceta-${randomBytes(8).toString("hex")}.bin`);
  await writeFile(path, bytes);
  try {
    return await fn(path);
  } finally {
    // Best effort: a leftover temp file is untidy, a thrown error here would
    // report a successful print as a failure.
    await unlink(path).catch(() => {});
  }
}

function run(cmd, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let err = "";
    child.stderr.on("data", (d) => {
      err += String(d);
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(err.trim() || `${cmd} exited ${code}`)),
    );
    if (input) {
      child.stdin.on("error", () => {});
      child.stdin.end(input);
    }
  });
}

async function printViaSystem(bytes, printer) {
  if (process.platform === "win32") {
    /*
      RAW BYTES TO A WINDOWS PRINTER.

      `COPY /B <file> \\localhost\<share>` is the one way to do this without a
      native module — which means the printer has to be SHARED, and the share
      name is what goes in `printer`. The README says so, because a person who
      puts the printer's display name here gets "The network name cannot be
      found" and no idea why.
    */
    if (!printer) throw new Error("No printer share name is set.");
    const share = printer.startsWith("\\\\") ? printer : `\\\\localhost\\${printer}`;
    return withTempFile(bytes, (path) =>
      run("cmd", ["/c", "copy", "/B", path, share]),
    );
  }

  // CUPS, on macOS and Linux. `-o raw` is what stops it trying to render
  // ESC/POS bytes as if they were a document.
  const args = ["-o", "raw"];
  if (printer) args.push("-d", printer);
  return run("lp", args, bytes);
}

function printViaTcp(bytes, host, port) {
  return new Promise((resolve, reject) => {
    if (!host) return reject(new Error("No printer address is set."));
    const socket = net.createConnection({ host, port }, () => {
      socket.end(bytes);
    });
    // A printer that is off answers nothing at all rather than refusing, so
    // without this the till waits forever on a sale that is already done.
    socket.setTimeout(5000);
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error(`${host}:${port} did not answer.`));
    });
    socket.on("error", reject);
    socket.on("close", () => resolve());
  });
}

export async function printBytes(bytes, config) {
  if (config.target === "tcp") {
    return printViaTcp(bytes, config.host, config.tcpPort || 9100);
  }
  return printViaSystem(bytes, config.printer);
}

/** The printers the operating system knows about, for the setup page. */
export async function listPrinters() {
  try {
    if (process.platform === "win32") {
      const out = await capture("powershell", [
        "-NoProfile",
        "-Command",
        "Get-Printer | Select-Object -ExpandProperty Name",
      ]);
      return out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    }
    const out = await capture("lpstat", ["-e"]);
    return out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  } catch {
    // No CUPS, no PowerShell, or neither on PATH. An empty list is honest; the
    // page lets the name be typed instead.
    return [];
  }
}

function capture(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let out = "";
    child.stdout.on("data", (d) => {
      out += String(d);
    });
    child.on("error", reject);
    child.on("close", () => resolve(out));
  });
}
