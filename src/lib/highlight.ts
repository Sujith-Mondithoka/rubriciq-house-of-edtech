export type Segment = { text: string; highlighted: boolean };

/**
 * Splits `text` into plain and highlighted segments for every occurrence of the quotes
 * (overlaps merged). Pure, so it renders as text nodes: no HTML is ever built from user input.
 */
export function highlightSegments(text: string, quotes: string[]): Segment[] {
  const ranges: [number, number][] = [];
  for (const quote of new Set(quotes.filter((q) => q.length > 0))) {
    for (let at = text.indexOf(quote); at !== -1; at = text.indexOf(quote, at + quote.length)) {
      ranges.push([at, at + quote.length]);
    }
  }
  if (!ranges.length) return text ? [{ text, highlighted: false }] : [];
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged.at(-1);
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }
  const segments: Segment[] = [];
  let cursor = 0;
  for (const [start, end] of merged) {
    if (start > cursor) segments.push({ text: text.slice(cursor, start), highlighted: false });
    segments.push({ text: text.slice(start, end), highlighted: true });
    cursor = end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), highlighted: false });
  return segments;
}
