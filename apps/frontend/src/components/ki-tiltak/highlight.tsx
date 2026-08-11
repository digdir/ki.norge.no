import type { ReactNode } from 'react';

/**
 * Pakker hvert treff på query i <mark>. Returnerer teksten uendret når det
 * ikke er noe søk, så kortene slipper unødvendige elementer.
 */
export function highlight(text: string, query: string): ReactNode {
  const needle = query.trim();
  if (needle.length === 0) return text;

  const haystack = text.toLowerCase();
  const lower = needle.toLowerCase();
  const parts: ReactNode[] = [];
  let from = 0;

  for (let i = haystack.indexOf(lower); i !== -1; i = haystack.indexOf(lower, from)) {
    if (i > from) parts.push(text.slice(from, i));
    parts.push(<mark key={i}>{text.slice(i, i + needle.length)}</mark>);
    from = i + needle.length;
  }

  if (parts.length === 0) return text;
  if (from < text.length) parts.push(text.slice(from));
  return parts;
}
