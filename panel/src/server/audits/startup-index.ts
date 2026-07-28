import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const AUDIT_JOB_RECORDS_FILENAME = ".omp-panel-audit-jobs.json";

const TERMINAL_STATUSES: Record<string, true> = {
  completed: true,
  insufficient_signal: true,
  failed: true,
};

const JOB_STATUSES: Record<string, true> = {
  queued: true,
  running: true,
  completed: true,
  insufficient_signal: true,
  failed: true,
  cancelled: true,
};

const BUNDLE_FILENAMES = ["manifest.json", "audit.json", "report.md", "evidence.jsonl"] as const;

type AuditJobStatus = keyof typeof JOB_STATUSES;
type TerminalAuditStatus = keyof typeof TERMINAL_STATUSES;

export interface IndexedAuditJob {
  id: string;
  sessionId: string;
  status: AuditJobStatus;
  createdAt: string;
  findings?: unknown[];
  fingerprint?: string;
  failureSummary?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAuditJobStatus(value: unknown): value is AuditJobStatus {
  return typeof value === "string" && Object.hasOwn(JOB_STATUSES, value);
}

function isTerminalAuditStatus(value: unknown): value is TerminalAuditStatus {
  return typeof value === "string" && Object.hasOwn(TERMINAL_STATUSES, value);
}

function normalizeAuditJob(value: unknown): IndexedAuditJob | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !value.id ||
    typeof value.sessionId !== "string" ||
    !value.sessionId ||
    !isAuditJobStatus(value.status) ||
    typeof value.createdAt !== "string" ||
    !value.createdAt ||
    (value.findings !== undefined && !Array.isArray(value.findings)) ||
    (value.fingerprint !== undefined && typeof value.fingerprint !== "string") ||
    (value.failureSummary !== undefined && typeof value.failureSummary !== "string")
  ) {
    return null;
  }

  return {
    id: value.id,
    sessionId: value.sessionId,
    status: value.status,
    createdAt: value.createdAt,
    ...(value.findings === undefined ? {} : { findings: value.findings }),
    ...(value.fingerprint === undefined ? {} : { fingerprint: value.fingerprint }),
    ...(value.failureSummary === undefined ? {} : { failureSummary: value.failureSummary }),
  };
}

function readJsonFile(filename: string): unknown | null {
  try {
    return JSON.parse(fs.readFileSync(filename, "utf8"));
  } catch {
    return null;
  }
}

function hasCanonicalArtifacts(bundleDir: string): boolean {
  return BUNDLE_FILENAMES.every((filename) => {
    try {
      return fs.statSync(path.join(bundleDir, filename)).isFile();
    } catch {
      return false;
    }
  });
}

function hasValidArtifacts(value: unknown): boolean {
  return (
    isRecord(value) &&
    value.manifest === "manifest.json" &&
    value.audit === "audit.json" &&
    value.report === "report.md" &&
    value.evidence === "evidence.jsonl"
  );
}

function hasParseableEvidence(bundleDir: string): boolean {
  try {
    const lines = fs.readFileSync(path.join(bundleDir, "evidence.jsonl"), "utf8").split(/\r?\n/);
    return lines.every((line) => !line.trim() || isRecord(JSON.parse(line)));
  } catch {
    return false;
  }
}

function terminalJobFromBundle(auditsRoot: string, auditId: string): IndexedAuditJob | null {
  const bundleDir = path.join(auditsRoot, auditId);
  if (!hasCanonicalArtifacts(bundleDir) || !hasParseableEvidence(bundleDir)) return null;

  const manifest = readJsonFile(path.join(bundleDir, "manifest.json"));
  const audit = readJsonFile(path.join(bundleDir, "audit.json"));
  if (!isRecord(manifest) || !isRecord(audit) || !isRecord(manifest.target)) return null;

  if (
    manifest.schemaVersion !== 1 ||
    audit.schemaVersion !== 1 ||
    manifest.auditId !== auditId ||
    audit.auditId !== auditId ||
    !isTerminalAuditStatus(manifest.status) ||
    typeof manifest.target.sessionId !== "string" ||
    !manifest.target.sessionId ||
    typeof manifest.createdAt !== "string" ||
    !manifest.createdAt ||
    !hasValidArtifacts(manifest.artifacts) ||
    !Array.isArray(audit.findings)
  ) {
    return null;
  }

  if (
    (manifest.status === "failed" && (typeof manifest.failureSummary !== "string" || !manifest.failureSummary)) ||
    (manifest.status !== "failed" && manifest.failureSummary !== undefined)
  ) {
    return null;
  }

  return {
    id: auditId,
    sessionId: manifest.target.sessionId,
    status: manifest.status,
    createdAt: manifest.createdAt,
    findings: audit.findings,
    ...(typeof manifest.fingerprint === "string" ? { fingerprint: manifest.fingerprint } : {}),
    ...(typeof manifest.failureSummary === "string" ? { failureSummary: manifest.failureSummary } : {}),
  };
}

export function auditsRoot(): string {
  return path.join(os.homedir(), ".omp", "forensics", "audits");
}

export function readAuditJobRecords(auditsRootPath: string = auditsRoot()): IndexedAuditJob[] {
  const records = readJsonFile(path.join(auditsRootPath, AUDIT_JOB_RECORDS_FILENAME));
  if (!Array.isArray(records)) return [];

  return records.flatMap((record) => {
    const job = normalizeAuditJob(record);
    return job ? [job] : [];
  });
}

export function writeAuditJobRecords(
  records: readonly IndexedAuditJob[],
  auditsRootPath: string = auditsRoot(),
): void {
  const normalized = records.flatMap((record) => {
    const job = normalizeAuditJob(record);
    return job ? [job] : [];
  });
  fs.mkdirSync(auditsRootPath, { recursive: true });

  const target = path.join(auditsRootPath, AUDIT_JOB_RECORDS_FILENAME);
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(normalized), "utf8");
  fs.renameSync(temporary, target);
}

export function indexAuditBundlesOnStartup(auditsRootPath: string = auditsRoot()): IndexedAuditJob[] {
  const jobsById = new Map(readAuditJobRecords(auditsRootPath).map((job) => [job.id, job]));

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(auditsRootPath, { withFileTypes: true });
  } catch {
    return [...jobsById.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const job = terminalJobFromBundle(auditsRootPath, entry.name);
    if (job) jobsById.set(job.id, job);
  }

  const jobs = [...jobsById.values()].sort((left, right) => {
    const byCreation = left.createdAt.localeCompare(right.createdAt);
    return byCreation || left.id.localeCompare(right.id);
  });

  try {
    writeAuditJobRecords(jobs, auditsRootPath);
  } catch {
    return jobs;
  }

  return jobs;
}
