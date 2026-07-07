/** Normalize text for duplicate comparison. */
export function normalizeListText(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(value: string): Set<string> {
  return new Set(normalizeListText(value).split(' ').filter(Boolean));
}

/** True when two strings are identical or nearly the same after normalization. */
export function isNearDuplicateText(a: unknown, b: unknown): boolean {
  const left = String(a ?? '').trim();
  const right = String(b ?? '').trim();
  if (!left || !right) return false;

  const normLeft = normalizeListText(left);
  const normRight = normalizeListText(right);
  if (normLeft === normRight) return true;
  if (normLeft.includes(normRight) || normRight.includes(normLeft)) return true;

  const tokensLeft = tokenSet(left);
  const tokensRight = tokenSet(right);
  if (!tokensLeft.size || !tokensRight.size) return false;
  let overlap = 0;
  for (const t of tokensLeft) {
    if (tokensRight.has(t)) overlap += 1;
  }
  const union = tokensLeft.size + tokensRight.size - overlap;
  return union > 0 && overlap / union >= 0.82;
}

/** Remove empty items; keep first occurrence of each normalized string. */
export function dedupeList(items: unknown[]): string[] {
  const out: string[] = [];
  for (const raw of items) {
    const text = String(raw ?? '').trim();
    if (!text) continue;
    if (out.some((kept) => isNearDuplicateText(text, kept))) continue;
    out.push(text);
  }
  return out;
}
