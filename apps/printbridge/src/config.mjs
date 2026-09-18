import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

/**
 * WHERE THE TILL'S SETTINGS LIVE.
 *
 * In the operator's home directory, not beside the program: a pharmacy that
 * re-downloads the helper should not lose the printer it already set up, and
 * nobody should have to run this as an administrator to save a setting.
 */
export const CONFIG_PATH = join(homedir(), ".resceta", "printbridge.json");

export const DEFAULTS = {
  port: 9110,
  /**
   * Which origins may ask this to print.
   *
   * THIS IS THE WHOLE SECURITY MODEL of a localhost server, and it is not
   * enough on its own — see `token`. A page on any site the cashier visits can
   * reach 127.0.0.1; the browser will not let it READ the reply from another
   * origin, but a plain POST still fires. So the origin is checked AND a secret
   * is required.
   */
  origins: ["https://resceta.vercel.app", "http://localhost:3000"],
  /** "tcp" | "system" */
  target: "system",
  /** For target "tcp": a network printer's address. */
  host: "",
  tcpPort: 9100,
  /**
   * For target "system": the printer's name in the operating system. A USB or
   * Bluetooth printer is a system printer once it is installed or paired, which
   * is why this one target covers both.
   */
  printer: "",
  token: "",
};

export function loadConfig() {
  let saved = {};
  try {
    saved = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    // No file yet, or an unreadable one. Defaults, and a fresh token below.
  }
  const config = { ...DEFAULTS, ...saved };

  /*
    A SECRET, GENERATED ON FIRST RUN.

    Without it, any web page the cashier happens to open could POST to this
    port and make the till print. The origin check above stops the honest
    cases; this stops the rest, because a page that does not know the token
    cannot make a valid request no matter where it is served from.
  */
  if (!config.token) {
    config.token = randomBytes(24).toString("base64url");
    saveConfig(config);
  }
  return config;
}

export function saveConfig(config) {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true });
  // 0600: the token is a password for this till's printer.
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), { mode: 0o600 });
}
