// @vitest-environment node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { start } from "./start.mjs";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const panelRoot = path.resolve(dirname, "..");
const nextDir = path.join(panelRoot, ".next");

let ctx: { server: net.Server; url: string; port: number };

beforeAll(async () => {
  // A clean checkout has no build cache - prove the build works from scratch.
  fs.rmSync(nextDir, { recursive: true, force: true });
  execFileSync("npm", ["run", "build"], {
    cwd: panelRoot,
    stdio: "inherit",
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  });
  ctx = await start();
}, 180_000);

afterAll(async () => {
  if (ctx?.server) {
    const { promise, resolve } = Promise.withResolvers<void>();
    ctx.server.close(() => resolve());
    await promise;
  }
});

describe("production build output", () => {
  it("exits 0 and emits a server entry, client JavaScript, CSS, fonts and icons", () => {
    // Reaching this point already proves the build exited 0 - execFileSync
    // throws on a non-zero exit and beforeAll would have failed the suite.
    expect(fs.existsSync(path.join(nextDir, "server", "app", "page.js"))).toBe(true);

    const chunkFiles = fs.readdirSync(path.join(nextDir, "static", "chunks"));
    expect(chunkFiles.some((f) => f.endsWith(".js"))).toBe(true);
    expect(chunkFiles.some((f) => f.endsWith(".css"))).toBe(true);

    const mediaFiles = fs.readdirSync(path.join(nextDir, "static", "media"));
    expect(mediaFiles.some((f) => f.endsWith(".woff2"))).toBe(true);
    expect(mediaFiles.some((f) => f.endsWith(".svg"))).toBe(true);
  });
});

describe("production start path", () => {
  it("invokes no dev server and no package install", () => {
    const source = fs.readFileSync(path.join(panelRoot, "runtime", "start.mjs"), "utf8");
    expect(source).not.toMatch(/next\s+dev/);
    expect(source).not.toMatch(/\bvite\b/i);
    expect(source).not.toMatch(/npm\s+(install|ci)\b/);
    expect(source).not.toMatch(/\bnpx\b/);
    // The production entry never shells out at all - it embeds Next's
    // request handler directly via the programmatic API.
    expect(source).not.toMatch(/node:child_process|require\(["']child_process["']\)/);
    expect(source).toMatch(/dev:\s*false/);

    const pkg = JSON.parse(fs.readFileSync(path.join(panelRoot, "package.json"), "utf8"));
    expect(pkg.scripts.start).not.toMatch(/next\s+dev|\bvite\b|npm\s+(install|ci)/);
  });
});

describe("serving", () => {
  it("answers 200 with the panel shell markup over loopback", async () => {
    const res = await fetch(ctx.url + "/");
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("OMP Panel");
  });

  it("answers the shell, an internal domain route and the event stream from the same process", async () => {
    const shell = await fetch(ctx.url + "/");
    expect(shell.status).toBe(200);

    const health = await fetch(ctx.url + "/internal/health");
    expect(health.status).toBe(200);
    expect(health.headers.get("content-type")).toContain("application/json");
    const body = await health.json();
    expect(body.status).toBe("ok");

    const controller = new AbortController();
    const stream = await fetch(ctx.url + "/internal/events", { signal: controller.signal });
    expect(stream.status).toBe(200);
    expect(stream.headers.get("content-type")).toContain("text/event-stream");
    controller.abort();
  });
});

describe("network boundary", () => {
  it("binds to 127.0.0.1 only", () => {
    const address = ctx.server.address();
    expect(address).not.toBeNull();
    expect(typeof address).not.toBe("string");
    expect((address as net.AddressInfo).address).toBe("127.0.0.1");
  });

  it("refuses a connection on a non-loopback address of the host", async () => {
    const interfaces = Object.values(os.networkInterfaces()).flat();
    const external = interfaces.find((entry) => entry && entry.family === "IPv4" && !entry.internal);
    expect(external, "this host has no non-loopback IPv4 interface to test against").toBeDefined();

    const { promise, resolve } = Promise.withResolvers<"connected" | "refused" | "silently-dropped">();
    const socket = net.connect({ host: external!.address, port: ctx.port });
    socket.once("connect", () => {
      socket.destroy();
      resolve("connected");
    });
    socket.once("error", () => resolve("refused"));
    // Real wall-clock bound, not a fake timer: this races the actual OS
    // network stack (a silently-dropped SYN has no event to await - fake
    // timers control the JS event loop, not kernel socket behaviour), so a
    // genuine delay is unavoidable here. Kept short and used nowhere else.
    const giveUp = setTimeout(() => {
      socket.destroy();
      resolve("silently-dropped");
    }, 2000);

    const outcome = await promise;
    clearTimeout(giveUp);

    // A loopback-only bind means this can surface either way depending on
    // the host's network stack: some OSes answer with an immediate RST
    // (ECONNREFUSED), others silently drop a SYN aimed at a LAN address with
    // no bound listener. Both prove the connection never succeeds; only an
    // actual established connection would mean the bind leaked beyond
    // loopback.
    expect(outcome).not.toBe("connected");
  }, 8000);

  it("carries no permissive CORS header on any panel response", async () => {
    for (const p of ["/", "/internal/health"]) {
      const res = await fetch(ctx.url + p, { headers: { Origin: "http://evil.example" } });
      expect(res.headers.get("access-control-allow-origin")).toBeNull();
    }
  });
});
