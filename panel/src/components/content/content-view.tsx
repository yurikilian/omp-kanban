import { sanitizeText } from "@/lib/sanitize";
import { cn } from "@/lib/utils";

export interface ContentViewProps {
  text: string;
  className?: string;
}

// 42rem / 672px at the default root size - a deliberately fixed value (not a
// viewport-relative one) so long-form prompt and response text keeps line
// lengths readable regardless of how wide the surrounding panel gets
// (E3-S7-AC1).
const readingColumnStyle = { maxWidth: "672px" } as const;

/**
 * Renders transcript-derived text as inert plain text inside a bounded
 * reading column. Every prompt, response and tool summary the timeline
 * shows is untrusted content from a session file on disk; this is the one
 * place that content is allowed to reach JSX, and it always goes through
 * `sanitizeText` first and renders as a plain text child - never
 * `dangerouslySetInnerHTML` - so nothing from a transcript can execute in
 * the browser (E3-S7-AC7).
 */
export function ContentView({ text, className }: ContentViewProps) {
  return (
    <div
      className={cn("max-w-[672px] whitespace-pre-wrap break-words text-sm text-foreground", className)}
      style={readingColumnStyle}
    >
      {sanitizeText(text)}
    </div>
  );
}
