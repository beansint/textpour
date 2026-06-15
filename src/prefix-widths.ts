// Per-line cursor<->point mapping. This is the data structure that powers hit-testing
// and caret placement (project D) and justification (project B). Build it once per line at
// layout time, then map point->index and index->point in O(log n).
//
// SCOPE: this is correct for left-to-right text. Bidi (visual vs logical order) is NOT handled
// here yet — see ROADMAP. For RTL/mixed lines you must consult Pretext's segLevels.

/** Measures the rendered width (px) of a string in a fixed font. */
export interface TextMeasurer {
  measure(text: string): number;
}

function segmentGraphemes(text: string, segmenter?: Intl.Segmenter): string[] {
  const seg = segmenter ?? new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const out: string[] = [];
  for (const part of seg.segment(text)) out.push(part.segment);
  return out;
}

/**
 * Cumulative x-offset at each grapheme boundary of a line.
 * Returns number[] of length (graphemeCount + 1); result[0] === 0 and
 * result[k] === width of the first k graphemes. Cumulative prefixes are measured
 * (not summed per-grapheme) so kerning/shaping between graphemes is captured.
 */
export function buildPrefixWidths(
  lineText: string,
  measurer: TextMeasurer,
  segmenter?: Intl.Segmenter,
): number[] {
  const graphemes = segmentGraphemes(lineText, segmenter);
  const prefix: number[] = [0];
  let cum = '';
  for (const g of graphemes) {
    cum += g;
    prefix.push(measurer.measure(cum));
  }
  return prefix;
}

/** Map an x offset (relative to line start) to the nearest grapheme boundary index. */
export function xToGraphemeIndex(prefix: number[], x: number): number {
  const last = prefix.length - 1;
  if (x <= 0) return 0;
  if (x >= prefix[last]!) return last;
  // Smallest index whose prefix >= x.
  let lo = 0;
  let hi = last;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (prefix[mid]! < x) lo = mid + 1;
    else hi = mid;
  }
  const hiIdx = lo;
  const loIdx = lo - 1;
  // Snap to the nearer of the two surrounding boundaries.
  return x - prefix[loIdx]! <= prefix[hiIdx]! - x ? loIdx : hiIdx;
}

/** Map a grapheme boundary index to its x offset (relative to line start). */
export function graphemeIndexToX(prefix: number[], index: number): number {
  const i = Math.max(0, Math.min(index, prefix.length - 1));
  return prefix[i]!;
}

/** Build a measurer backed by a Canvas 2D context (browser or node-canvas). */
export function canvasMeasurer(
  ctx: { font: string; measureText(s: string): { width: number } },
  font: string,
): TextMeasurer {
  ctx.font = font;
  return { measure: (t: string) => ctx.measureText(t).width };
}
