// omp-kanban — session_start hook: launch the vendored sessions dashboard once,
// as a cross-session singleton.
//
// On every session start we either REUSE an already-running dashboard (this
// session or any other) or, if none is alive, start one on a random free port as
// a detached daemon that outlives the session. All work is time-boxed and wrapped
// so a failure here can never block or break session start.
//
// State shared across sessions lives at ~/.omp/agent/dashboard/:
//   state.json  { port, pid, startedAt }   — the running daemon
//   .lock       (a directory)              — atomic guard against two sessions
//                                            racing to start at the same moment
//
// Discovery: omp loads hooks/pre/*.ts as extension modules; this default export
// receives the HookAPI. The type import is erased at runtime.
import type { HookAPI } from "@oh-my-pi/pi-coding-agent/extensibility/hooks";

import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const HEALTH_TIMEOUT_MS = 500;
const LOCK_STALE_MS = 30_000;

const STATE_DIR = path.join(os.homedir(), ".omp", "agent", "dashboard");
const STATE_FILE = path.join(STATE_DIR, "state.json");
const LOCK_DIR = path.join(STATE_DIR, ".lock");

interface DashboardState {
  port: number;
  pid: number;
  startedAt: string;
}

// dashboard/ sits two levels up from hooks/pre/<this file>.
function dashboardRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "..", "dashboard");
}

// Installed with --with-dashboard? Needs the built UI and the server's deps.
function dashboardInstalled(root: string): boolean {
  return (
    fs.existsSync(path.join(root, "web", "dist", "index.html")) &&
    fs.existsSync(path.join(root, "server", "node_modules")) &&
    fs.existsSync(path.join(root, "server", "src", "index.js"))
  );
}

function readState(): DashboardState | null {
  try {
    const raw = fs.readFileSync(STATE_FILE, "utf8");
    const s = JSON.parse(raw) as DashboardState;
    if (typeof s?.port === "number" && typeof s?.pid === "number") return s;
  } catch {
    /* no/invalid state */
  }
  return null;
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0); // signal 0 = existence check, kills nothing
    return true;
  } catch {
    return false;
  }
}

function health(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(
      { host: "127.0.0.1", port, path: "/health", timeout: HEALTH_TIMEOUT_MS },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(body)?.status === "ok");
          } catch {
            resolve(false);
          }
        });
      },
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

// A dashboard is "live" only if its recorded pid is alive AND it answers /health.
async function liveState(): Promise<DashboardState | null> {
  const s = readState();
  if (s && pidAlive(s.pid) && (await health(s.port))) return s;
  return null;
}

// Poll /health until the freshly-spawned daemon answers, or give up. Called while
// still holding the lock so a concurrent session cannot mistake a half-booted
// daemon for dead and start a second copy. Bounded so a failed boot never hangs
// the lock (a crashed boot just falls through and the pid check reclaims later).
async function waitForHealth(port: number, timeoutMs = 5000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await health(port)) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => (port ? resolve(port) : reject(new Error("no port"))));
    });
  });
}

// Atomic across processes: mkdir succeeds for exactly one racer. A lock older
// than LOCK_STALE_MS is assumed abandoned and reclaimed.
function acquireLock(): boolean {
  try {
    fs.mkdirSync(LOCK_DIR); // throws EEXIST if held
    return true;
  } catch {
    try {
      const age = Date.now() - fs.statSync(LOCK_DIR).mtimeMs;
      if (age > LOCK_STALE_MS) {
        fs.rmSync(LOCK_DIR, { recursive: true, force: true });
        fs.mkdirSync(LOCK_DIR);
        return true;
      }
    } catch {
      /* fall through */
    }
    return false;
  }
}

function releaseLock(): void {
  try {
    fs.rmSync(LOCK_DIR, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
}

function openBrowser(url: string): void {
  if (process.env.OMP_KANBAN_DASHBOARD_OPEN !== "1") return;
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "cmd"
        : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    spawn(cmd, args, { detached: true, stdio: "ignore" }).unref();
  } catch {
    /* non-fatal */
  }
}

// Detached so the daemon survives this session ending. cwd is set to the current
// project so the dashboard flags it as the "current" project in /api/projects.
//
// Runs under a real `node`, not `process.execPath`: inside omp's TS runtime the
// exec path is the omp binary, and the server is a Node ESM app whose native
// better-sqlite3 was compiled against the ambient Node ABI at install time.
// Override the interpreter with OMP_KANBAN_NODE if `node` is not on PATH.
function startDaemon(root: string, port: number, cwd: string): number {
  const serverEntry = path.join(root, "server", "src", "index.js");
  const node = process.env.OMP_KANBAN_NODE || "node";
  const child = spawn(node, [serverEntry], {
    cwd,
    detached: true,
    stdio: "ignore",
    env: { ...process.env, PORT: String(port) },
  });
  child.unref();
  return child.pid ?? -1;
}

export default function hook(pi: HookAPI): void {
  pi.on("session_start", async (_event, ctx) => {
    try {
      const root = dashboardRoot();
      if (!dashboardInstalled(root)) return; // installed without --with-dashboard

      // Reuse a live dashboard (this session or another).
      const live = await liveState();
      if (live) {
        pi.sendMessage(
          `📊 Sessions dashboard already running at http://localhost:${live.port}`,
        );
        return;
      }

      // Nobody live — try to become the one that starts it.
      if (!acquireLock()) return; // a sibling session is starting it right now
      try {
        // Re-check under the lock: the sibling may have just published.
        const raced = await liveState();
        if (raced) {
          pi.sendMessage(
            `📊 Sessions dashboard already running at http://localhost:${raced.port}`,
          );
          return;
        }

        const cwd =
          (ctx && (ctx as { cwd?: string }).cwd) || process.cwd();
        const port = await freePort();
        const pid = startDaemon(root, port, cwd);
        fs.mkdirSync(STATE_DIR, { recursive: true });
        const state: DashboardState = {
          port,
          pid,
          startedAt: new Date().toISOString(),
        };
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

        // Hold the lock until the daemon actually answers, so a concurrent
        // session sees either the lock or a healthy /health — never a booting
        // daemon it treats as dead and duplicates.
        const url = `http://localhost:${port}`;
        if (await waitForHealth(port)) {
          pi.sendMessage(`📊 Sessions dashboard started at ${url}`);
          openBrowser(url);
        } else {
          pi.sendMessage(
            `📊 Sessions dashboard launching at ${url} (still starting up)`,
          );
        }
      } finally {
        releaseLock();
      }
    } catch {
      // Never let a launcher failure break session start.
    }
  });
}
