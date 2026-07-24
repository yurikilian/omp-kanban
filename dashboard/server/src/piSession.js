// Sole import site for `@earendil-works/pi-coding-agent`. We use pi's
// low-level, header-position-tolerant parser (`parseSessionEntries` +
// `migrateSessionEntries`, exported from `dist/core/session-manager.js`)
// rather than the package's high-level session APIs (`SessionManager.open`/
// `list`/`listAll`), because those reject omp's files: omp writes a
// `{"type":"title",...}` line BEFORE the `{"type":"session",...}` header,
// and pi's high-level loader requires the header to be entries[0].
//
// We locate the package's on-disk `dist/` directory by walking up the
// filesystem for a `node_modules/@earendil-works/pi-coding-agent` folder
// (the same lookup Node's own bare-specifier resolution does), rather than
// via `import.meta.resolve`/`require.resolve`: `require.resolve` fails
// outright (this package's `"exports"` map has no `"require"` condition,
// only `"import"`), and `import.meta.resolve` is unavailable under
// Vitest's SSR transform (`__vite_ssr_import_meta__.resolve is not a
// function`). The manual walk sidesteps both `exports`-map gating (only
// `.` and `./rpc-entry` are listed there) and the tooling gap, so we pull
// in just `core/session-manager.js` and its light deps — not the full
// `dist/index.js` graph, which eagerly re-exports the TUI/CLI and is
// heavy/unsafe to evaluate headlessly.
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';

function findPackageDir(startDir, pkgName) {
  let dir = startDir;
  for (;;) {
    const candidate = path.join(dir, 'node_modules', pkgName);
    if (fsSync.existsSync(path.join(candidate, 'package.json'))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`Cannot find package "${pkgName}" from ${startDir}`);
    dir = parent;
  }
}

const pkgDir = findPackageDir(path.dirname(fileURLToPath(import.meta.url)), '@earendil-works/pi-coding-agent');
const smPath = path.join(pkgDir, 'dist/core/session-manager.js');
let _mod;
const pi = () => (_mod ??= import(pathToFileURL(smPath).href));

/**
 * Read a session `.jsonl` file and return pi-parsed, migrated entries.
 * Tolerant of omp's title-before-header line ordering. Returns `[]` on
 * any read error (missing file, etc.) rather than throwing.
 */
export async function loadEntries(filePath) {
  let content;
  try {
    content = await fs.readFile(filePath, 'utf8');
  } catch {
    return [];
  }
  const { parseSessionEntries, migrateSessionEntries } = await pi();
  const entries = parseSessionEntries(content);
  migrateSessionEntries(entries);
  return entries;
}

/**
 * Read the real absolute `cwd` a session was created with, from the
 * `{"type":"session",...,"cwd":"/abs/path"}` header entry. Returns `null`
 * if the file can't be read or has no session header with a `cwd`.
 */
export async function readCwd(filePath) {
  const entries = await loadEntries(filePath);
  const header = entries.find((e) => e.type === 'session');
  return header && typeof header.cwd === 'string' ? header.cwd : null;
}
