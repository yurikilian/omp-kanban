import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { reconcileOrphanedRunningJobs, recordSkippedBundleDirectory } from "./reconcile";
import type { AuditJob, AuditJobStatus } from "./types";

export const AUDIT_JOB_RECORDS_FILENAME = ".omp-panel-audit-jobs.json";

type TerminalAuditStatus = Extract<AuditJobStatus, "completed" | "insufficient_signal" | "failed">;
const TERMINAL_STATUSES: Record<TerminalAuditStatus, true> = {
  completed: true,
  insufficient_signal: true,
  failed: true,
};

const JOB_STATUSES: Record<AuditJobStatus, true> = {
  queued: true,
  running: true,
  completed: true,
  insufficient_signal: true,
  failed: true,
  cancelled: true,
  interrupted: true,
};

const BUNDLE_FILENAMES = ["manifest.json", "audit.json", "report.md", "evidence.jsonl"] as const;


export interface IndexedAuditJob extends AuditJob {
  pid?: number;
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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isRecordArray(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value) && value.every(isRecord);
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || typeof value === "number";
}

function hasRecoverableSessionTotals(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNullableNumber(value.inputTokens) &&
    isNullableNumber(value.outputTokens) &&
    isNullableNumber(value.cost) &&
    (value.currency === null || isNonEmptyString(value.currency))
  );
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
    (value.failureSummary !== undefined && typeof value.failureSummary !== "string") ||
    (value.reason !== undefined && typeof value.reason !== "string") ||
    (value.exitStatus !== undefined && !isNullableNumber(value.exitStatus)) ||
    (value.stderrSummary !== undefined && typeof value.stderrSummary !== "string") ||
    (value.pid !== undefined && typeof value.pid !== "number")
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
    ...(value.reason === undefined ? {} : { reason: value.reason }),
    ...(value.exitStatus === undefined ? {} : { exitStatus: value.exitStatus }),
    ...(value.stderrSummary === undefined ? {} : { stderrSummary: value.stderrSummary }),
    ...(value.pid === undefined ? {} : { pid: value.pid }),
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

function terminalJobFromBundle(
  auditsRoot: string,
  auditId: string,
  existing?: IndexedAuditJob,
): IndexedAuditJob | null {
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
    !isNonEmptyString(manifest.target.sessionId) ||
    !isNonEmptyString(manifest.target.transcriptPath) ||
    !isNonEmptyString(manifest.fingerprint) ||
    !isRecord(manifest.analyzer) ||
    !isNonEmptyString(manifest.analyzer.name) ||
    !isNonEmptyString(manifest.analyzer.version) ||
    !isNonEmptyString(manifest.createdAt) ||
    !isNonEmptyString(manifest.startedAt) ||
    !isNonEmptyString(manifest.completedAt) ||
    !hasValidArtifacts(manifest.artifacts) ||
    !isStringArray(audit.coverageGaps) ||
    !hasRecoverableSessionTotals(audit.sessionTotals) ||
    !isRecordArray(audit.findings) ||
    !isRecordArray(audit.proposals) ||
    !isNonEmptyString(audit.methodology)
  ) {
    return null;
  }

  if (
    (manifest.status === "failed" && (typeof manifest.failureSummary !== "string" || !manifest.failureSummary)) ||
    (manifest.status !== "failed" && manifest.failureSummary !== undefined)
  ) {
    return null;
  }

  const bundleJob: IndexedAuditJob = {
    id: auditId,
    sessionId: manifest.target.sessionId,
    status: manifest.status,
    createdAt: manifest.createdAt,
    findings: audit.findings,
    ...(typeof manifest.fingerprint === "string" ? { fingerprint: manifest.fingerprint } : {}),
    ...(typeof manifest.failureSummary === "string" ? { failureSummary: manifest.failureSummary } : {}),
    ...(manifest.status === "failed" && existing?.status === "failed" && existing.exitStatus !== undefined
      ? { exitStatus: existing.exitStatus }
      : {}),
    ...(manifest.status === "failed" && existing?.status === "failed" && existing.stderrSummary !== undefined
      ? { stderrSummary: existing.stderrSummary }
      : {}),
  };

  return existing && existing.status !== "queued" && existing.status !== "running"
    ? { ...bundleJob, ...existing }
    : bundleJob;
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

    const job = terminalJobFromBundle(auditsRootPath, entry.name, jobsById.get(entry.name));
    if (job) {
      jobsById.set(job.id, job);
      continue;
    }

    if (!jobsById.has(entry.name)) recordSkippedBundleDirectory(auditsRootPath, entry.name);
  }

  const jobs = reconcileOrphanedRunningJobs([...jobsById.values()]).sort((left, right) => {
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
