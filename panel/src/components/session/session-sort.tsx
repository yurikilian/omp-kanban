import type { SessionSortKey, SessionSortState } from "@/lib/session-query";

interface SessionSortProps {
  sort: SessionSortState;
  onChange: (key: SessionSortKey) => void;
}

const SORT_OPTIONS: ReadonlyArray<{ key: SessionSortKey; label: string }> = [
  { key: "cost", label: "Cost" },
  { key: "duration", label: "Duration" },
  { key: "lastActivity", label: "Last activity" },
];

export function SessionSort({ sort, onChange }: SessionSortProps) {
  return (
    <div aria-label="Sort sessions by" className="flex items-center gap-2" role="group">
      {SORT_OPTIONS.map(({ key, label }) => {
        const isActive = sort.key === key;
        const name = isActive ? `${label}, ${sort.direction}` : label;

        return (
          <button
            aria-pressed={isActive}
            className="rounded-md border border-border px-3 py-1 text-sm hover:bg-muted"
            key={key}
            onClick={() => onChange(key)}
            type="button"
          >
            {name}
          </button>
        );
      })}
    </div>
  );
}