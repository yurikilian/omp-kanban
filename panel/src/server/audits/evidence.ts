import fs from "node:fs/promises";
import path from "node:path";
import type { ZodType } from "zod";
import { isSafeSessionId } from "@/server/sessions/detail";
import { getSessionTimeline, type TimelineEvent } from "@/server/sessions/timeline";
import { auditManifestSchema, auditReportSchema, evidenceRecordSchema, type EvidenceRecord } from "./bundle-schema";

/**
 * Reads only the evidence records named in `ids` out of one bundle's
 * `evidence.jsonl` - never the rest of the file. Every non-blank line is
 * cheaply tested for the wanted ids as raw text first; only a line that
 * could possibly match pays for `JSON.parse` and schema validation. A
 * finding only ever needs the handful of records it cites, so a bundle's
 * evidence file - which can grow far larger than any one finding needs -
 * is never parsed in full to answer that (E4-S9-AC4).
 *
 * Every record sharing a requested id is returned, not just the first -
 * duplicate ids are a bundle defect the caller must be able to detect,
 * not one this function should silently resolve by picking a winner.
 */
export async function readEvidenceRecords(bundleDirectory: string, ids: ReadonlySet<string>): Promise<EvidenceRecord[]> {
  if (ids.size === 0) return [];

  let content: string;
  try {
    content = await fs.readFile(path.join(bundleDirectory, "evidence.jsonl"), "utf8");
  } catch {
    return [];
  }

  const wantedIds = [...ids];
  const matches: EvidenceRecord[] = [];

  for (const rawLine of content.split("\n")) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    if (!wantedIds.some((id) => trimmed.includes(id))) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }

    const result = evidenceRecordSchema.safeParse(parsed);
    if (result.success && ids.has(result.data.id)) matches.push(result.data);
  }

  return matches;
}

/**
 * Whether `eventRef` still names a real event in `sessionId`'s recorded
 * transcript. Returns `null` - not `false` - when the transcript itself
 * could not be read at all (an unsafe id, no such session, or the
 * sessions root being unreachable): that is a different failure this
 * function cannot use to prove the event is gone, so a caller must not
 * treat "unknown" as "missing" (E4-S9-AC3).
 */
export async function isEventInTranscript(sessionId: string, eventRef: string, sessionsRoot: string): Promise<boolean | null> {
  if (!isSafeSessionId(sessionId)) return null;

  let timeline: TimelineEvent[] | null;
  try {
    timeline = await getSessionTimeline(sessionId, sessionsRoot);
  } catch {
    return null;
  }
  if (timeline === null) return null;

  return timeline.some((event) => event.id === eventRef);
}

async function readBundleJson<T>(bundleDirectory: string, filename: string, schema: ZodType<T>): Promise<T | null> {
  let raw: string;
  try {
    raw = await fs.readFile(path.join(bundleDirectory, filename), "utf8");
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const result = schema.safeParse(parsed);
  return result.success ? result.data : null;
}

export type EvidenceResolution =
  | { status: "not-found" }
  | { status: "resolved"; evidence: EvidenceRecord }
  | { status: "event-missing"; evidence: EvidenceRecord };

export interface ResolveEvidenceForFindingOptions {
  bundleDirectory: string;
  auditId: string;
  evidenceId: string;
  sessionsRoot: string;
}

/**
 * Resolves one finding's cited evidence record to its target session,
 * agent and event - loading only that evidence record (E4-S9-AC4) and
 * reporting explicitly when its event is no longer present in the
 * session transcript rather than resolving it anyway (E4-S9-AC3).
 */
export async function resolveEvidenceForFinding({
  bundleDirectory,
  auditId,
  evidenceId,
  sessionsRoot,
}: ResolveEvidenceForFindingOptions): Promise<EvidenceResolution> {
  const [manifest, audit] = await Promise.all([
    readBundleJson(bundleDirectory, "manifest.json", auditManifestSchema),
    readBundleJson(bundleDirectory, "audit.json", auditReportSchema),
  ]);

  if (!manifest || !audit || manifest.status !== "completed" || manifest.auditId !== auditId || audit.auditId !== auditId) {
    return { status: "not-found" };
  }

  const isCitedByFinding = audit.findings.some((finding) => finding.evidenceIds.includes(evidenceId));
  if (!isCitedByFinding) return { status: "not-found" };

  const matches = await readEvidenceRecords(bundleDirectory, new Set([evidenceId]));
  if (matches.length !== 1) return { status: "not-found" };
  const [evidence] = matches;

  if (evidence.sessionId !== manifest.target.sessionId || !isSafeSessionId(evidence.sessionId)) {
    return { status: "not-found" };
  }

  const eventPresent = await isEventInTranscript(evidence.sessionId, evidence.eventRef, sessionsRoot);
  if (eventPresent === false) return { status: "event-missing", evidence };

  return { status: "resolved", evidence };
}
