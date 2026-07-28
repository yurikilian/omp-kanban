import { createHash } from "node:crypto";

export interface AuditTarget {
  targetContent: string;
  analyzerVersion: string;
}

/**
 * Returns a stable identity for precisely the content an analyzer would read
 * and the analyzer version that would interpret it. Length prefixes prevent
 * distinct content/version pairs from sharing a concatenated hash input.
 */
export function fingerprintAuditTarget(targetContent: string, analyzerVersion: string): string {
  const hash = createHash("sha256");

  hash.update(String(Buffer.byteLength(targetContent))).update(":").update(targetContent);
  hash.update(String(Buffer.byteLength(analyzerVersion))).update(":").update(analyzerVersion);

  return hash.digest("hex");
}