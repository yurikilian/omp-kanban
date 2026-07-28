import fs from "node:fs";
import path from "node:path";
import { validateAuditBundle, type BundleValidation } from "./validate";

export interface IndexedAuditBundle {
  /** The bundle directory's own name - the audit id, by construction (`panel/docs/audit-bundle.md`'s canonical `<audits-root>/<audit-id>/`). */
  auditId: string;
  bundleDir: string;
  validation: BundleValidation;
  /** Known once the manifest itself has validated; null otherwise - an unresolved bundle attaches to no session rather than a guessed one. */
  sessionId: string | null;
}

export interface AuditBundleIndex {
  /** Every bundle found under the root, valid or not - an invalid or incomplete audit is recorded, not silently dropped (E4-S5-AC2, E4-S5-AC4). */
  all: IndexedAuditBundle[];
  bySessionId: Map<string, IndexedAuditBundle[]>;
}

/**
 * Scan `rootDir` for audit bundle directories and validate each one
 * (E4-S5, `panel/omp-panel-prompt-v2.md` domain architecture "Audit
 * indexing"). Never throws: a root that does not exist yet indexes as
 * empty, a non-directory entry alongside the bundles is skipped, and one
 * bad bundle does not stop the rest from indexing.
 */
export function indexAuditBundles(rootDir: string): AuditBundleIndex {
  const all: IndexedAuditBundle[] = [];
  const bySessionId = new Map<string, IndexedAuditBundle[]>();

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(rootDir, { withFileTypes: true });
  } catch {
    return { all, bySessionId };
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const auditId = entry.name;
    const bundleDir = path.join(rootDir, auditId);
    const validation = validateAuditBundle(bundleDir);
    let sessionId: string | null = null;
    if (validation.status === "valid") {
      sessionId = validation.manifest.target.sessionId;
    } else if (validation.status === "invalid") {
      sessionId = validation.manifest?.target.sessionId ?? null;
    }
    const indexed: IndexedAuditBundle = { auditId, bundleDir, validation, sessionId };

    all.push(indexed);
    if (sessionId === null) continue;
    const forSession = bySessionId.get(sessionId);
    if (forSession) {
      forSession.push(indexed);
    } else {
      bySessionId.set(sessionId, [indexed]);
    }
  }

  return { all, bySessionId };
}

/** The bundles indexed for one session - what a session detail view reads (E4-S5-AC1). */
export function auditsForSession(index: AuditBundleIndex, sessionId: string): IndexedAuditBundle[] {
  return index.bySessionId.get(sessionId) ?? [];
}
