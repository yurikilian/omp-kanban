#!/usr/bin/env node
// Production entry point for the OMP Panel.
//
// This is the "thin custom Node entry point" the spec allows: it embeds
// Next's production request handler directly (no `next start` subprocess,
// no dev server, no package install) and binds to 127.0.0.1 only, so the
// panel is never reachable from outside the host it runs on. It also
// answers two process-level endpoints - /internal/health and
// /internal/events - proving the single-runtime model: one process serves
// the page shell, internal domain routes and the live-event stream. Real
// domain routes and the real event stream land under src/app/api/** in
// later tasks; this is the architectural seam they'll be added through.
//
// The launcher hook (panel/runtime/kb-panel.ts, added in a later task)
// spawns this file directly and reads the printed URL; it is not run
// through `npm start`.

process.env.NEXT_TELEMETRY_DISABLED = "1";

import { createServer } from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import next from "next";
const require = createRequire(import.meta.url);
const { initializeAuditJobStore } = require("../src/server/audits/job-store.ts");

// Hard-coded, not configurable: the panel must never bind beyond loopback.
const HOST = "127.0.0.1";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const panelRoot = path.resolve(dirname, "..");

// PORT is optional: 0 (or unset) asks the OS for a free port, which start.mjs
// prints so both callers and tests can discover it.
const requestedPort = Number.parseInt(process.env.PORT ?? "0", 10) || 0;

const app = next({ dev: false, dir: panelRoot });
const handle = app.getRequestHandler();

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

// Proves the single-runtime model: an internal, non-Next-page route
// answered by the exact same process and listener as the page shell.
function serveHealth(res) {
  sendJson(res, 200, { status: "ok", pid: process.pid });
}

// Proves the same process also carries a live-event stream. Later tasks
// replace this with the real sessions stream (src/app/api/stream/route.ts);
// this is the minimal proof that the mechanism works end to end.
function serveEvents(req, res) {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
  });
  res.write("event: ready\ndata: {}\n\n");
  req.on("close", () => res.end());
}

// No CORS header is ever set here, and none of Next's own defaults add one:
// the panel is a single-origin, loopback-only surface and cross-origin
// access is a permanent non-goal, not a configuration to remember.
function requestListener(req, res) {
  const { pathname } = new URL(req.url, `http://${HOST}`);

  if (pathname === "/internal/health") {
    serveHealth(res);
    return;
  }

  if (pathname === "/internal/events") {
    serveEvents(req, res);
    return;
  }

  handle(req, res);
}

export async function start() {
  initializeAuditJobStore();
  await app.prepare();

  const server = createServer(requestListener);

  const { promise, resolve, reject } = Promise.withResolvers();
  server.once("error", reject);
  server.listen(requestedPort, HOST, resolve);
  await promise;

  const address = server.address();
  const url = `http://${HOST}:${address.port}`;
  console.log(url);

  return { server, url, port: address.port };
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  start().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
