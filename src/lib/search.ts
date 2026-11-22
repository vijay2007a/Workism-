const fold = (s: string) => s.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase();

export function searchItems<T extends { label: string; hint?: string }>(items: readonly T[], query: string): T[] {
  const q = fold(query.trim());
  if (!q) return [];
  const rank = (i: T) => {
    const label = fold(i.label);
    if (label.startsWith(q)) return 0;
    if (label.includes(q)) return 1;
    return fold(i.hint ?? '').includes(q) ? 2 : 3;
  };
  return items
    .map((item) => ({ item, r: rank(item) }))
    .filter((x) => x.r < 3)
    .sort((a, b) => a.r - b.r)
    .map((x) => x.item);
}
