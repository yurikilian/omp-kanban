const defaultAnalyzerCommand = "omp";

export interface AuditPricing {
  available: boolean;
  pricing: string | null;
}

export interface AnalyzerCommandInput {
  auditId: string;
  targetTranscript: string;
  bundleDirectory: string;
  pricing?: AuditPricing;
}

export interface AnalyzerCommand {
  command: string;
  args: string[];
}

export function buildAnalyzerCommand(input: AnalyzerCommandInput): AnalyzerCommand {
  const pricingInstructions =
    input.pricing?.available && input.pricing.pricing !== null
      ? ["User-supplied pricing (carry it verbatim):", input.pricing.pricing]
      : ["Pricing is unavailable. Report token-only usage.", "Do not recall prices from model memory."];

  const prompt = [
    "Use the cost-forensics skill to analyze this panel-requested audit.",
    `Audit ID: ${input.auditId}`,
    `Target session transcript: ${input.targetTranscript}`,
    `Output bundle directory: ${input.bundleDirectory}`,
    ...pricingInstructions,
  ].join("\n");

  return {
    command: process.env.OMP_PANEL_ANALYZER_COMMAND || defaultAnalyzerCommand,
    args: ["-p", prompt],
  };
}