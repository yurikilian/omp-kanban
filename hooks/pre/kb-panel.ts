import { exec } from "child_process";
import { promises as fs } from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dirname, "../..");
const panelDir = path.join(repoRoot, "panel");
const stateDir = path.join(process.env.HOME!, ".omp", "agent", "panel");

interface HookAPI {
  on: (event: string, handler: (ctx: any) => void) => void;
}

function log(msg: string) {
  console.log(`[panel] ${msg}`);
}

function exec_async(cmd: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    exec(cmd, (error, stdout, stderr) => {
      resolve({ stdout: stdout || "", stderr: stderr || "" });
    });
  });
}

async function ensurePanelBuilt(): Promise<void> {
  const distDir = path.join(panelDir, ".next");
  try {
    await fs.access(distDir);
    // .next exists, assume built
    return;
  } catch {
    log("Building panel (first time or clean install)...");
    const { stderr } = await exec_async(`cd "${panelDir}" && npm run build 2>&1`);
    if (stderr && stderr.includes("error")) {
      log(`⚠️  build warning: ${stderr.substring(0, 200)}`);
    }
    log("Panel built.");
  }
}

async function startPanel(): Promise<string> {
  // Ensure state directory exists
  try {
    await fs.mkdir(stateDir, { recursive: true });
  } catch {}

  const stateFile = path.join(stateDir, "state.json");

  // Check if already running
  try {
    const state = JSON.parse(await fs.readFile(stateFile, "utf8"));
    if (state.pid) {
      const { stdout } = await exec_async(`kill -0 ${state.pid} 2>/dev/null && echo alive || echo dead`);
      if (stdout.includes("alive")) {
        return state.url || "http://localhost:3391";
      }
    }
  } catch {
    // State file doesn't exist or invalid
  }

  // Start the panel
  log("Starting panel server...");
  const cmd = `cd "${panelDir}" && npm start 2>&1`;
  const proc = exec(cmd, (error) => {
    if (error) {
      log(`⚠️  Panel process exited: ${error.message}`);
    }
  });

  if (!proc.pid) {
    throw new Error("Failed to start panel process");
  }

  // Give it 2 seconds to start and bind the port
  await new Promise((r) => setTimeout(r, 2000));

  const url = "http://localhost:3391";
  const state = {
    pid: proc.pid,
    url,
    startedAt: new Date().toISOString(),
  };

  try {
    await fs.writeFile(stateFile, JSON.stringify(state, null, 2));
  } catch {}

  log(`Panel running at ${url} (PID ${proc.pid})`);
  return url;
}

export default function install(pi: HookAPI) {
  pi.on("session:start", async () => {
    if (process.env.OMP_PANEL_DISABLED === "1") {
      return;
    }

    try {
      await ensurePanelBuilt();
      const url = await startPanel();

      if (process.env.OMP_PANEL_OPEN === "1") {
        log(`Opening ${url} in browser...`);
        const openCmd =
          process.platform === "darwin"
            ? `open "${url}"`
            : process.platform === "win32"
              ? `start "${url}"`
              : `xdg-open "${url}"`;
        exec(openCmd, () => {}); // fire and forget
      } else {
        log(`Visit: ${url}`);
      }
    } catch (err) {
      log(`⚠️  Failed to start: ${err instanceof Error ? err.message : String(err)}`);
    }
  });
}
