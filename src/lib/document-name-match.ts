/** Exact full-token comparison only; no fuzzy edits, initials expansion or missing-name guesses. */
export function normalizedNameTokens(value: string): string[] {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/[’'`]/g, "")
    .replace(/[.,\-‐‑–—]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .sort();
}
export function documentNamesMatch(first: string, second: string): boolean {
  const a = normalizedNameTokens(first),
    b = normalizedNameTokens(second);
  return (
    a.length >= 2 &&
    a.every((token) => /^\p{L}{2,}$/u.test(token)) &&
    a.length === b.length &&
    a.every((token, index) => token === b[index])
  );
}
