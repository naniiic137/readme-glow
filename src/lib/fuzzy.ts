/**
 * Small fuzzy matcher for the command palette: characters must appear in
 * order; word starts and consecutive runs score higher.
 */
export function fuzzyScore(query: string, text: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const t = text.toLowerCase();
  const direct = t.indexOf(q);
  if (direct !== -1) return 1000 - direct * 2 - (t.length - q.length) * 0.1 + (direct === 0 || /[\s/:-]/.test(t[direct - 1] ?? '') ? 200 : 0);
  let score = 0;
  let ti = 0;
  let run = 0;
  for (const ch of q) {
    if (ch === ' ') continue;
    const idx = t.indexOf(ch, ti);
    if (idx === -1) return -1;
    const wordStart = idx === 0 || /[\s/:_.-]/.test(t[idx - 1] ?? '');
    run = idx === ti ? run + 1 : 0;
    score += 10 + (wordStart ? 25 : 0) + run * 8 - Math.min(idx - ti, 20);
    ti = idx + 1;
  }
  return score - t.length * 0.1;
}

export function fuzzyFilter<T>(items: T[], query: string, text: (item: T) => string, limit = 60): T[] {
  if (!query.trim()) return items.slice(0, limit);
  return items
    .map((item, i) => ({ item, i, s: fuzzyScore(query, text(item)) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.item);
}
