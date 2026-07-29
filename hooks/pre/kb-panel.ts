// omp-kanban — session_start hook: launch the OMP Panel once, as a
// cross-session singleton.
//
// On every session start we either REUSE an already-running panel (this
// session or any other) or, if none is alive, start one on a random free port
// as a detached daemon that outlives the session. All work is time-boxed and
// wrapped so a failure here can never block or break session start.
//
// State shared across sessions lives at ~/.omp/agent/panel/:
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

const STATE_DIR = path.join(os.homedir(), ".omp", "agent", "panel");
const STATE_FILE = path.join(STATE_DIR, "state.json");
const LOCK_DIR = path.join(STATE_DIR, ".lock");

interface PanelState {
  port: number;
  pid: number;
  startedAt: string;
}

// panel/ sits two levels up from hooks/pre/<this file>.
function panelRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "..", "panel");
}

// Installed via `npm install && npm run build` in panel/? Needs deps and the
// production build, plus the launcher entry itself.
function panelInstalled(root: string): boolean {
  return (
    fs.existsSync(path.join(root, "node_modules")) &&
    fs.existsSync(path.join(root, ".next")) &&
    fs.existsSync(path.join(root, "runtime", "start.mjs"))
  );
}

function readState(): PanelState | null {
  try {
    const raw = fs.readFileSync(STATE_FILE, "utf8");
    const s = JSON.parse(raw) as PanelState;
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
      { host: "127.0.0.1", port, path: "/internal/health", timeout: HEALTH_TIMEOUT_MS },
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

// A panel is "live" only if its recorded pid is alive AND it answers
// /internal/health.
async function liveState(): Promise<PanelState | null> {
  const s = readState();
  if (s && pidAlive(s.pid) && (await health(s.port))) return s;
  return null;
}

// Poll /internal/health until the freshly-spawned daemon answers, or give up.
// Called while still holding the lock so a concurrent session cannot mistake a
// half-booted daemon for dead and start a second copy. Bounded so a failed
// boot never hangs the lock (a crashed boot just falls through and the pid
// check reclaims later).
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
    fs.mkdirSync(STATE_DIR, { recursive: true });
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
  if (process.env.OMP_PANEL_OPEN !== "1") return;
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

// Detached so the daemon survives this session ending. Runs under a real
// `node`, not `process.execPath`: inside omp's TS runtime the exec path is the
// omp binary, and runtime/start.mjs is a Node ESM script whose deps (Next,
// etc.) were installed against the ambient Node ABI. Override the
// interpreter with OMP_PANEL_NODE if `node` is not on PATH.
function startDaemon(root: string, port: number): number {
  const entry = path.join(root, "runtime", "start.mjs");
  const node = process.env.OMP_PANEL_NODE || "node";
  const child = spawn(node, [entry], {
    cwd: root,
    detached: true,
    stdio: "ignore",
    env: { ...process.env, PORT: String(port) },
  });
  child.unref();
  return child.pid ?? -1;
}

export default function hook(pi: HookAPI): void {
  pi.on("session_start", async () => {
    if (process.env.OMP_PANEL_DISABLED === "1") return;

    try {
      const root = panelRoot();
      if (!panelInstalled(root)) return; // panel not built at this install

      // Reuse a live panel (this session or another).
      const live = await liveState();
      if (live) {
        pi.sendMessage(`📋 OMP Panel already running at http://127.0.0.1:${live.port}`);
        return;
      }

      // Nobody live — try to become the one that starts it.
      if (!acquireLock()) return; // a sibling session is starting it right now
      try {
        // Re-check under the lock: the sibling may have just published.
        const raced = await liveState();
        if (raced) {
          pi.sendMessage(`📋 OMP Panel already running at http://127.0.0.1:${raced.port}`);
          return;
        }

        const port = await freePort();
        const pid = startDaemon(root, port);
        fs.mkdirSync(STATE_DIR, { recursive: true });
        const state: PanelState = { port, pid, startedAt: new Date().toISOString() };
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

        // Hold the lock until the daemon actually answers, so a concurrent
        // session sees either the lock or a healthy /internal/health — never
        // a booting daemon it treats as dead and duplicates.
        const url = `http://127.0.0.1:${port}`;
        if (await waitForHealth(port)) {
          pi.sendMessage(`📋 OMP Panel started at ${url}`);
          openBrowser(url);
        } else {
          pi.sendMessage(`📋 OMP Panel launching at ${url} (still starting up)`);
        }
      } finally {
        releaseLock();
      }
    } catch {
      // Never let a launcher failure break session start.
    }
  });
}
