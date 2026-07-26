/**
 * OMP Prism theme resolver.
 *
 * Toggles the `.dark` class on the document root, which is what
 * `src/styles/tokens.css` keys its `:root`/`.dark` token values off of (see
 * DESIGN-SYSTEM.md section 3.1).
 */
export type Theme = "light" | "dark";

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function getTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function toggleTheme(): Theme {
  const next: Theme = getTheme() === "dark" ? "light" : "dark";
  applyTheme(next);
  return next;
}
