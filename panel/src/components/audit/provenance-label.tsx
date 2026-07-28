import { formatProvenance, type ValueProvenance } from "@/lib/provenance";

export interface ProvenanceLabelProps {
  provenance: ValueProvenance;
}

const provenanceClasses: Record<ValueProvenance, string> = {
  observed: "bg-sky-100 text-sky-900",
  derived: "bg-violet-100 text-violet-900",
  estimated: "bg-amber-100 text-amber-900",
  inferred: "bg-orange-100 text-orange-900",
  unavailable: "bg-muted text-muted-foreground",
};

export function ProvenanceLabel({ provenance }: ProvenanceLabelProps) {
  return (
    <span data-provenance={provenance} className={`rounded-full px-2 py-0.5 text-xs font-medium ${provenanceClasses[provenance]}`}>
      {formatProvenance(provenance)}
    </span>
  );
}
