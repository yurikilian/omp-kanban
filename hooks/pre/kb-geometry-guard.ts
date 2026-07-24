// omp-kanban — session_start hook: warn when a component suite asserts styling
// but cannot actually resolve it.
//
// Why this exists. A rail icon shipped at roughly 215px past a fully green
// suite. The stylesheet sized it via `.icon svg` while the component put that
// class on the `<svg>` itself, so the rule matched nothing. Every test passed,
// because they matched the `.css` file's TEXT. Under vitest, CSS imports are
// stubbed unless `css: true` is set, so `getComputedStyle` cannot tell a
// selector that matches from one that matches nothing — the single condition
// that let the defect through.
//
// This fires only when that exact condition holds: a vitest config without
// `css: true`, in a project that has both component tests and stylesheets. It
// says nothing otherwise. A hook that cries wolf on every session start costs
// tokens on every run and gets ignored, which is worse than no hook.
//
// Discovery: omp loads hooks/pre/*.ts as extension modules; this default export
// receives the HookAPI. The type import is erased at runtime.
import type { HookAPI } from "@oh-my-pi/pi-coding-agent/extensibility/hooks";

import fs from "node:fs";
import path from "node:path";

const CONFIG_NAMES = [
  "vitest.config.js",
  "vitest.config.ts",
  "vitest.config.mjs",
  "vite.config.js",
  "vite.config.ts",
];

const SKIP_DIRS: Record<string, true> = {
  node_modules: true,
  ".git": true,
  dist: true,
  build: true,
  coverage: true,
  ".next": true,
  ".omp": true,
  ".kanban": true,
};

const MAX_DEPTH = 3;
const MAX_CONFIGS = 8;

// Bounded walk: a few dozen readdir calls at worst, and it stops early once it
// has enough. Session start must stay fast.
function findConfigs(root: string): string[] {
  const found: string[] = [];

  const walk = (dir: string, depth: number): void => {
    if (depth > MAX_DEPTH || found.length >= MAX_CONFIGS) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (found.length >= MAX_CONFIGS) return;
      if (entry.isFile() && CONFIG_NAMES.includes(entry.name)) {
        found.push(path.join(dir, entry.name));
      } else if (entry.isDirectory() && !SKIP_DIRS[entry.name] && !entry.name.startsWith(".")) {
        walk(path.join(dir, entry.name), depth + 1);
      }
    }
  };

  walk(root, 0);
  return found;
}

// Only worth warning if the project actually renders components and ships
// stylesheets — otherwise there is no geometry to get wrong.
function hasStyleAssertions(dir: string): boolean {
  let sawTest = false;
  let sawCss = false;

  const walk = (current: string, depth: number): void => {
    if (depth > MAX_DEPTH || (sawTest && sawCss)) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (sawTest && sawCss) return;
      if (entry.isFile()) {
        if (/\.test\.(jsx|tsx)$/.test(entry.name)) sawTest = true;
        else if (entry.name.endsWith(".css")) sawCss = true;
      } else if (entry.isDirectory() && !SKIP_DIRS[entry.name] && !entry.name.startsWith(".")) {
        walk(path.join(current, entry.name), depth + 1);
      }
    }
  };

  walk(dir, 0);
  return sawTest && sawCss;
}

export default function hook(pi: HookAPI): void {
  pi.on("session_start", async (_event, ctx) => {
    try {
      let cwd = process.cwd();
      if (ctx && typeof ctx === "object" && "cwd" in ctx && typeof ctx.cwd === "string") {
        cwd = ctx.cwd;
      }

      const gaps: string[] = [];
      for (const config of findConfigs(cwd)) {
        let source: string;
        try {
          source = fs.readFileSync(config, "utf8");
        } catch {
          continue;
        }
        // Only vitest configs matter; a plain vite build config has no suite.
        // The `css: true` check is deliberately loose — it only decides whether
        // to print a hint, so a false negative is free, while a regex chasing
        // every formatting variant would be its own maintenance burden.
        if (!/\btest\s*:/.test(source)) continue;
        if (/\bcss\s*:\s*true/.test(source)) continue;
        if (!hasStyleAssertions(path.dirname(config))) continue;
        gaps.push(path.relative(cwd, config) || config);
      }

      if (gaps.length === 0) return;

      pi.sendMessage(
        `🎨 Style assertions may be inert in: ${gaps.join(", ")}\n` +
          `   \`css: true\` is not set, so CSS imports are stubbed and ` +
          `getComputedStyle cannot distinguish a selector that matches from one ` +
          `that matches nothing.\n` +
          `   See the \`rendered-geometry-tests\` skill before asserting on styling.`,
      );
    } catch {
      // A hint is never worth breaking session start over.
    }
  });
}
