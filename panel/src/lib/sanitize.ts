// Neutralises transcript-derived text before it ever reaches JSX (E3-S7-AC7).
// Prompts, tool intents and model output are untrusted - a session transcript
// is just a file on disk, and nothing stops it from containing a literal
// `<script>` tag or an event-handler attribute. This is a plain string
// transform (never `dangerouslySetInnerHTML`): callers render the result as
// ordinary JSX text, so React's own escaping is the final backstop even if a
// pathological input ever slipped past the regexes below.
//
// This deliberately renders markup as inert *text*, not sanitised HTML - a
// full HTML sanitiser (parsing, allow-listing safe tags/attributes) is a much
// larger dependency than anything a plain-text timeline needs today.

// A script or style element's entire contents are removable outright: there
// is no readable inner text worth preserving from either.
const SCRIPT_OR_STYLE_BLOCK = /<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi;

// Any other tag - opening, closing, or self-closing - is stripped down to
// just its inner text. Requiring a letter immediately after `<` (or `</`)
// keeps ordinary comparison text such as "1 < 2" untouched: a bare `<`
// followed by a space or digit never matches.
const HTML_TAG = /<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^<>]*)?\/?>/g;

/** Strips markup down to inert, readable plain text (E3-S7-AC7). */
export function sanitizeText(input: string): string {
  return input.replace(SCRIPT_OR_STYLE_BLOCK, "").replace(HTML_TAG, "");
}