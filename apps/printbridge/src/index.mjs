#!/usr/bin/env node
import http from "node:http";
import { loadConfig, CONFIG_PATH } from "./config.mjs";
import { handler } from "./server.mjs";

const config = loadConfig();
const server = http.createServer(handler(config));

// 127.0.0.1, NOT 0.0.0.0. Nothing on the shop's Wi-Fi can see this, so a
// customer on the guest network cannot make the till print.
server.listen(config.port, "127.0.0.1", () => {
  console.log("");
  console.log("  Resceta print bridge is running.");
  console.log("");
  console.log(`  Address:  http://127.0.0.1:${config.port}`);
  console.log(`  Token:    ${config.token}`);
  console.log("");
  console.log("  Paste that token into Resceta:  Settings -> How this till reaches its printer");
  console.log(`  Settings file: ${CONFIG_PATH}`);
  console.log("");
  console.log("  Leave this window open while the till is in use.");
  console.log("");
});

server.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    // The overwhelmingly likely cause, said plainly instead of a stack trace.
    console.error(`\n  Port ${config.port} is already in use — the bridge may already be running.\n`);
    process.exit(1);
  }
  throw e;
});
