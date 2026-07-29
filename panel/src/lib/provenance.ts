export const provenanceLabels = {
  observed: "Observed",
  derived: "Derived",
  estimated: "Estimated",
  inferred: "Inferred",
  unavailable: "Unavailable",
} as const;

export type ValueProvenance = keyof typeof provenanceLabels;

export function formatProvenance(provenance: ValueProvenance): string {
  return provenanceLabels[provenance];
}
