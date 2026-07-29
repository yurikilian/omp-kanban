import fs from "node:fs";
import path from "node:path";
import {
  EvidenceJsonlError,
  SUPPORTED_AUDIT_SCHEMA_VERSIONS,
  auditManifestSchema,
  auditReportSchema,
  parseEvidenceJsonl,
  type AuditManifest,
  type AuditReport,
  type EvidenceRecord,
} from "./bundle-schema.ts";

/**
 * The four files every finished audit bundle contains
 * (`panel/docs/audit-bundle.md`). Fixed names, checked in this order - a
 * bundle directory missing any one of them has not finished being written
 * yet (E4-S5-AC4).
 */
export const AUDIT_BUNDLE_FILENAMES = ["manifest.json", "audit.json", "report.md", "evidence.jsonl"] as const;

type BundleFilename = (typeof AUDIT_BUNDLE_FILENAMES)[number];

export interface BundleValidationIssue {
  /** Which bundle file the problem was found in. */
  file: BundleFilename;
  /** Dotted field path within the file, or `line <n>` for an evidence.jsonl record. */
  location: string;
  message: string;
}

export type BundleValidation =
  | {
      status: "incomplete";
      /** Canonical files not yet present in the bundle directory. */
      missingFiles: string[];
    }
  | {
      status: "unsupported_schema_version";
      /** Read straight off the manifest, whatever shape it turned out to be - never coerced. */
      schemaVersion: unknown;
    }
  | {
      status: "invalid";
      issues: BundleValidationIssue[];
      /** The manifest, when it itself validated - so an audit.json or evidence.jsonl failure still resolves to its session. Null when the manifest itself is what failed. */
      manifest: AuditManifest | null;
    }
  | {
      status: "valid";
      manifest: AuditManifest;
      audit: AuditReport;
      evidence: EvidenceRecord[];
      reportMarkdown: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type JsonReadResult = { ok: true; value: unknown } | { ok: false; issue: BundleValidationIssue };

function readJsonFile(bundleDir: string, filename: "manifest.json" | "audit.json"): JsonReadResult {
  const raw = fs.readFileSync(path.join(bundleDir, filename), "utf8");
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return {
      ok: false,
      issue: { file: filename, location: "(file)", message: `${filename} is not valid JSON` },
    };
  }
}

/**
 * Validate one audit bundle directory as untrusted input
 * (`panel/docs/audit-bundle.md`, E4-S5). Never throws: every way a bundle
 * can be nonconforming, unsupported or still being written is a
 * `BundleValidation` variant instead of an exception, so a caller indexing
 * many bundles never has one bad directory take the rest down with it
 * (see `./index-bundles.ts`).
 */
export function validateAuditBundle(bundleDir: string): BundleValidation {
  const missingFiles = AUDIT_BUNDLE_FILENAMES.filter((filename) => !fs.existsSync(path.join(bundleDir, filename)));
  if (missingFiles.length > 0) {
    return { status: "incomplete", missingFiles };
  }

  const manifestJson = readJsonFile(bundleDir, "manifest.json");
  if (!manifestJson.ok) {
    return { status: "invalid", issues: [manifestJson.issue], manifest: null };
  }

  // Checked before, and independently of, full schema validation, so an
  // unsupported version is reported as itself rather than as a pile of
  // confusing field errors from optimistically running today's schema over
  // a shape it was never meant to describe (E4-S5-AC3). Only a genuine
  // version number short-circuits here - anything else (missing, wrong
  // type) falls through to the ordinary schema failure below, which names
  // `schemaVersion` as the offending field.
  const rawSchemaVersion = isRecord(manifestJson.value) ? manifestJson.value.schemaVersion : undefined;
  if (typeof rawSchemaVersion === "number" && !SUPPORTED_AUDIT_SCHEMA_VERSIONS.includes(rawSchemaVersion)) {
    return { status: "unsupported_schema_version", schemaVersion: rawSchemaVersion };
  }

  const manifestResult = auditManifestSchema.safeParse(manifestJson.value);
  if (!manifestResult.success) {
    return {
      status: "invalid",
      issues: manifestResult.error.issues.map((issue) => ({
        file: "manifest.json" as const,
        location: issue.path.join(".") || "(root)",
        message: issue.message,
      })),
      manifest: null,
    };
  }
  const manifest = manifestResult.data;

  const auditJson = readJsonFile(bundleDir, "audit.json");
  if (!auditJson.ok) {
    return { status: "invalid", issues: [auditJson.issue], manifest };
  }
  const auditResult = auditReportSchema.safeParse(auditJson.value);
  if (!auditResult.success) {
    return {
      status: "invalid",
      issues: auditResult.error.issues.map((issue) => ({
        file: "audit.json" as const,
        location: issue.path.join(".") || "(root)",
        message: issue.message,
      })),
      manifest,
    };
  }

  let evidence: EvidenceRecord[];
  try {
    evidence = parseEvidenceJsonl(fs.readFileSync(path.join(bundleDir, "evidence.jsonl"), "utf8"));
  } catch (error) {
    if (!(error instanceof EvidenceJsonlError)) throw error;
    return {
      status: "invalid",
      issues: [{ file: "evidence.jsonl", location: `line ${error.lineNumber}`, message: error.message }],
      manifest,
    };
  }

  const reportMarkdown = fs.readFileSync(path.join(bundleDir, "report.md"), "utf8");

  return { status: "valid", manifest, audit: auditResult.data, evidence, reportMarkdown };
}
