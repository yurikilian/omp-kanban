import { z } from "zod";

/**
 * Runtime schema for two of the four files in a panel-dispatched audit
 * bundle (`agents/kb-forensics.md`, `panel/docs/audit-bundle.md`):
 * `audit.json` (an `AuditReport`) and `evidence.jsonl` (one `EvidenceRecord`
 * per line). `kb-forensics` is prompt-driven, so nothing about a bundle is
 * guaranteed by construction - the panel must validate every bundle as
 * untrusted input, and this module is that validator.
 *
 * `manifest.json`'s shape is fully documented in both files above but has
 * no reader here yet - nothing in this cycle consumes it. Add it when a
 * task that reads a bundle off disk actually needs it, instead of ahead of
 * that need.
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
