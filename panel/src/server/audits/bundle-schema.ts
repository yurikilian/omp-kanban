import { z } from "zod";

/**
 * Runtime schema for the three files in a panel-dispatched audit bundle
 * that carry structured content (`agents/kb-forensics.md`,
 * `panel/docs/audit-bundle.md`): `manifest.json` (an `AuditManifest`),
 * `audit.json` (an `AuditReport`) and `evidence.jsonl` (one `EvidenceRecord`
 * per line). `kb-forensics` is prompt-driven, so nothing about a bundle is
 * guaranteed by construction - the panel must validate every bundle as
 * untrusted input, and this module is that validator. `./validate.ts`
 * builds on these schemas to decide a whole bundle directory's state
 * (conforming, invalid, an unsupported schema version, or still being
 * written) - see it for how "which file, which field or line" gets
 * reported for a bundle that fails to validate.
 */

const lowMediumHigh = z.enum(["low", "medium", "high"]);

/**
 * A minimum/likely/maximum estimate - the shape every savings figure in a
 * bundle uses. `minimum <= likely <= maximum` because anything else is not
 * a range.
 */
const savingsRangeSchema = z
  .object({
    minimum: z.number().nonnegative(),
    likely: z.number().nonnegative(),
    maximum: z.number().nonnegative(),
  })
  .refine((range) => range.minimum <= range.likely && range.likely <= range.maximum, {
    message: "a savings range must satisfy minimum <= likely <= maximum",
  });

/**
 * What actually happened, measured - not a projection. `outputTokens: 0` is
 * a real, recorded zero; `null` means that dimension could not be measured
 * at all, which is a different fact.
 */
const observedImpactSchema = z.object({
  inputTokens: z.number().nullable(),
  outputTokens: z.number().nullable(),
  cost: z.number().nullable(),
});

/**
 * A savings estimate. `inputTokens`/`outputTokens` are each present only
 * when this item has an estimate for that dimension - omitted, never a
 * zeroed-out range, when it does not. `cost` is always present, either a
 * range or `null` (pricing unavailable) - see the audit-wide pricing rule
 * enforced by `auditReportSchema` below.
 */
const estimatedSavingsSchema = z.object({
  inputTokens: savingsRangeSchema.optional(),
  outputTokens: savingsRangeSchema.optional(),
  cost: savingsRangeSchema.nullable(),
});

const sessionTotalsSchema = z.object({
  inputTokens: z.number().nullable(),
  outputTokens: z.number().nullable(),
  cost: z.number().nullable(),
  currency: z.string().min(1).nullable(),
});

const findingSchema = z.object({
  id: z.string().min(1),
  category: z.string().min(1),
  title: z.string().min(1),
  severity: lowMediumHigh,
  confidence: lowMediumHigh,
  summary: z.string().min(1),
  observedImpact: observedImpactSchema,
  estimatedSavings: estimatedSavingsSchema,
  evidenceIds: z.array(z.string().min(1)),
  causalChain: z.array(z.string()),
  limitations: z.array(z.string()),
  proposalIds: z.array(z.string().min(1)),
});

const proposalSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["hook", "skill", "agent"]),
  title: z.string().min(1),
  wastePrevented: z.array(z.string().min(1)),
  expectedSavings: estimatedSavingsSchema,
  maintenanceCost: lowMediumHigh,
  implementationRisk: lowMediumHigh,
  filesLikelyAffected: z.array(z.string()),
  validationPlan: z.array(z.string()),
  // Nothing in the panel applies a proposal, ever - this is always false in
  // practice today, and the schema holds that as fact rather than letting
  // the panel merely assume it (panel/docs/audit-bundle.md).
  automaticApplicationAllowed: z.literal(false),
});

export const auditReportSchema = z
  .object({
    schemaVersion: z.literal(1),
    auditId: z.string().min(1),
    coverageGaps: z.array(z.string()),
    sessionTotals: sessionTotalsSchema,
    // Ordered highest impact first - that order *is* the ranking; there is
    // no separate rank field (panel/docs/audit-bundle.md).
    findings: z.array(findingSchema),
    proposals: z.array(proposalSchema),
    methodology: z.string().min(1),
  })
  .superRefine((audit, ctx) => {
    // sessionTotals.currency is the single fact that decides pricing
    // availability for the whole document (E4-S1-AC4: an audit either has
    // pricing or runs token-only, never partially). Once it is null, every
    // other cost figure in the bundle must be null too - a non-null cost
    // anywhere past that point is a guess, not a measurement.
    if (audit.sessionTotals.currency !== null) return;

    const rejectIfGuessed = (cost: number | SavingsRange | null, path: (string | number)[]) => {
      if (cost === null) return;
      ctx.addIssue({
        code: "custom",
        path,
        message:
          "cost must be null when sessionTotals.currency is null - pricing was unavailable for this audit, so a non-null cost here would be a guess",
      });
    };

    rejectIfGuessed(audit.sessionTotals.cost, ["sessionTotals", "cost"]);
    audit.findings.forEach((finding, index) => {
      rejectIfGuessed(finding.observedImpact.cost, ["findings", index, "observedImpact", "cost"]);
      rejectIfGuessed(finding.estimatedSavings.cost, ["findings", index, "estimatedSavings", "cost"]);
    });
    audit.proposals.forEach((proposal, index) => {
      rejectIfGuessed(proposal.expectedSavings.cost, ["proposals", index, "expectedSavings", "cost"]);
    });
  });

export type SavingsRange = z.infer<typeof savingsRangeSchema>;
export type ObservedImpact = z.infer<typeof observedImpactSchema>;
export type EstimatedSavings = z.infer<typeof estimatedSavingsSchema>;
export type SessionTotals = z.infer<typeof sessionTotalsSchema>;
export type Finding = z.infer<typeof findingSchema>;
export type Proposal = z.infer<typeof proposalSchema>;
export type AuditReport = z.infer<typeof auditReportSchema>;

/** Parse and validate one `audit.json` document. Throws `z.ZodError` on anything nonconforming. */
export function parseAuditReport(input: unknown): AuditReport {
  return auditReportSchema.parse(input);
}

/**
 * Never copy an entire large tool result into `excerpt` - past this bound,
 * summarize into `explanation` and cite `digest` instead
 * (panel/docs/audit-bundle.md, agents/kb-forensics.md). Chosen to match the
 * `head -c 2000` this same agent already uses to sample a transcript during
 * schema discovery, so one bound governs both.
 */
export const EVIDENCE_EXCERPT_MAX_LENGTH = 2000;

export const evidenceRecordSchema = z
  .object({
    id: z.string().min(1),
    sessionId: z.string().min(1),
    eventRef: z.string().min(1),
    agentId: z.string().min(1),
    timestamp: z.iso.datetime(),
    eventType: z.string().min(1),
    // Present only when eventType is tool-related; omitted otherwise.
    toolName: z.string().min(1).optional(),
    measured: z
      .record(z.string(), z.number())
      .refine((measured) => Object.keys(measured).length > 0, {
        message: "measured must back at least one numeric value - a record measuring nothing has no reason to exist",
      }),
    explanation: z.string().min(1),
    excerpt: z.string().max(EVIDENCE_EXCERPT_MAX_LENGTH).optional(),
    digest: z.string().min(1).optional(),
    sourceLocation: z.string().min(1),
  })
  .superRefine((record, ctx) => {
    const hasExcerpt = record.excerpt !== undefined;
    const hasDigest = record.digest !== undefined;
    if (hasExcerpt === hasDigest) {
      ctx.addIssue({
        code: "custom",
        path: [hasExcerpt ? "digest" : "excerpt"],
        message: "exactly one of excerpt or digest must be present - never both, never neither",
      });
    }
  });

export type EvidenceRecord = z.infer<typeof evidenceRecordSchema>;

/** Raised by `parseEvidenceJsonl` naming the 1-based line that failed, so a caller can point at the exact bad record. */
export class EvidenceJsonlError extends Error {
  constructor(
    public readonly lineNumber: number,
    detail: string,
  ) {
    super(`evidence.jsonl line ${lineNumber}: ${detail}`);
    this.name = "EvidenceJsonlError";
  }
}

/**
 * Parse `evidence.jsonl` content (one JSON object per line, blank lines
 * ignored) into evidence records. Strict, unlike session-transcript
 * parsing: this file is written once by a finished analyzer run rather than
 * tailed live, so every non-blank line must parse and validate - the first
 * line that does not throws rather than being silently dropped.
 */
export function parseEvidenceJsonl(content: string): EvidenceRecord[] {
  const records: EvidenceRecord[] = [];

  content.split("\n").forEach((rawLine, index) => {
    const trimmed = rawLine.trim();
    if (!trimmed) return;

    const lineNumber = index + 1;
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(trimmed);
    } catch {
      throw new EvidenceJsonlError(lineNumber, "line is not valid JSON");
    }

    const result = evidenceRecordSchema.safeParse(parsedJson);
    if (!result.success) {
      const detail = result.error.issues
        .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join("; ");
      throw new EvidenceJsonlError(lineNumber, detail);
    }
    records.push(result.data);
  });

  return records;
}

/**
 * Whether `report.md` and `audit.json` from the same audit agree on their
 * findings (E4-S4-AC5, agents/kb-forensics.md's `report.md` contract):
 * every finding named in `audit.json` appears in the report, and the
 * report names no finding `audit.json` does not have.
 *
 * Findings are rendered in `report.md` as their own `### <title>`
 * subsection - using the finding's `title` field verbatim as the heading
 * text - under the `## Expensive patterns found` section. That convention
 * is what makes this comparison possible at all; see the same section of
 * `agents/kb-forensics.md`.
 */
export interface ReportFindingsComparison {
  /** Finding titles present in `audit.json` with no matching subsection in `report.md`. */
  missingFromReport: string[];
  /** Subsection headings in `report.md` with no matching finding in `audit.json`. */
  extraInReport: string[];
}

const EXPENSIVE_PATTERNS_HEADING = "## Expensive patterns found";

function extractExpensivePatternsSection(reportMarkdown: string): string {
  const startIndex = reportMarkdown.indexOf(EXPENSIVE_PATTERNS_HEADING);
  if (startIndex === -1) return "";

  const afterHeading = startIndex + EXPENSIVE_PATTERNS_HEADING.length;
  const rest = reportMarkdown.slice(afterHeading);
  // The next level-2 heading closes the section; absent one, it runs to the end.
  const nextSectionMatch = rest.match(/^##\s+.+$/m);
  const sectionEnd = nextSectionMatch?.index ?? rest.length;
  return rest.slice(0, sectionEnd);
}

export function checkReportMatchesFindings(audit: AuditReport, reportMarkdown: string): ReportFindingsComparison {
  const section = extractExpensivePatternsSection(reportMarkdown);
  const reportedTitles = new Set([...section.matchAll(/^###\s+(.+)$/gm)].map((match) => match[1].trim()));
  const findingTitles = new Set(audit.findings.map((finding) => finding.title));

  return {
    missingFromReport: [...findingTitles].filter((title) => !reportedTitles.has(title)),
    extraInReport: [...reportedTitles].filter((title) => !findingTitles.has(title)),
  };
}

/**
 * `manifest.json`'s documented shape (`panel/docs/audit-bundle.md`) - the
 * file a reader opens first to decide what state a bundle is in before it
 * trusts anything else inside it. `status` holds only the three terminal
 * values `kb-forensics` itself ever writes; `queued`, `running` and
 * `cancelled` live solely in the job service's own job record and never
 * appear in a bundle on disk (`panel/docs/audit-bundle.md`, "Status
 * values") - there is nothing here to validate for them.
 */
const auditManifestStatusSchema = z.enum(["completed", "insufficient_signal", "failed"]);

const auditManifestArtifactsSchema = z.object({
  // Fixed names, not merely conventional ones - restated here as literals
  // because the contract calls them fixed (panel/docs/audit-bundle.md,
  // "The four files").
  manifest: z.literal("manifest.json"),
  audit: z.literal("audit.json"),
  report: z.literal("report.md"),
  evidence: z.literal("evidence.jsonl"),
});

export const auditManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    auditId: z.string().min(1),
    status: auditManifestStatusSchema,
    target: z.object({
      sessionId: z.string().min(1),
      // Omitted when the transcript is not grouped under one project.
      project: z.string().min(1).optional(),
      transcriptPath: z.string().min(1),
    }),
    fingerprint: z.string().min(1),
    analyzer: z.object({
      name: z.literal("kb-forensics"),
      version: z.string().min(1),
    }),
    createdAt: z.iso.datetime(),
    startedAt: z.iso.datetime(),
    completedAt: z.iso.datetime(),
    artifacts: auditManifestArtifactsSchema,
    // Present only when status is "failed" - enforced below, not by
    // optionality alone, so a failed manifest cannot omit the explanation
    // and a non-failed one cannot carry a stray leftover from a failure
    // that did not happen.
    failureSummary: z.string().min(1).optional(),
  })
  .superRefine((manifest, ctx) => {
    const hasFailureSummary = manifest.failureSummary !== undefined;
    if (manifest.status === "failed" && !hasFailureSummary) {
      ctx.addIssue({
        code: "custom",
        path: ["failureSummary"],
        message: 'failureSummary is required when status is "failed"',
      });
    }
    if (manifest.status !== "failed" && hasFailureSummary) {
      ctx.addIssue({
        code: "custom",
        path: ["failureSummary"],
        message: 'failureSummary must be absent unless status is "failed"',
      });
    }
  });

export type AuditManifest = z.infer<typeof auditManifestSchema>;

/**
 * Schema versions this build of the panel knows how to read. A version
 * outside this set is unsupported rather than invalid - see
 * `./validate.ts`, which reports that distinctly and does not attempt to
 * run an unsupported version's manifest through this schema at all
 * (E4-S5-AC3).
 */
export const SUPPORTED_AUDIT_SCHEMA_VERSIONS: readonly number[] = [1];
