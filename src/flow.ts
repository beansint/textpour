import type { Region } from './region.js';
import { intersectSpans } from './region.js';
import type { LineSource } from './line-source.js';
import type { FlowOptions, FlowResult, Interval, PlacedLine, WordSegment } from './types.js';
import { balancedFlow } from './balance.js';

function widestSpan(spans: Interval[]): Interval {
  let best = spans[0]!;
  let bestW = best[1] - best[0];
  for (let i = 1; i < spans.length; i++) {
    const w = spans[i]![1] - spans[i]![0];
    if (w > bestW) {
      best = spans[i]!;
      bestW = w;
    }
  }
  return best;
}

/**
 * Conservative band sampling: intersect the region's spans across `steps` sample points evenly
 * spread within [y, y+lineHeight). The result is the x-ranges inside the shape across the WHOLE
 * band, so a line never pokes outside a tight curve. Returns [] as soon as any sample is empty.
 */
function bandSpans(region: Region, y: number, lineHeight: number, steps: number): Interval[] {
  const step = lineHeight / steps;
  let acc: Interval[] | null = null;
  for (let k = 0; k < steps; k++) {
    const sampleY = y + step * (k + 0.5);
    const s = region.spansAt(sampleY);
    acc = acc === null ? s : intersectSpans(acc, s);
    if (acc.length === 0) return [];
  }
  return acc ?? [];
}

/**
 * Pour text from `source` into `region`, line by line.
 *
 * For each row band [y, y+lineHeight) we sample the region's inside-spans at the row center,
 * then feed each span's width to the source as a maxWidth. With multiSpan='fill' a single row can
 * consume several disjoint spans (the cursor trick): we keep advancing the same cursor across
 * spans WITHOUT advancing y, which is how concave shapes and holes get filled.
 *
 * Pure function of (source, region, options) — the source is stateless w.r.t. the cursor, so this
 * is safe to call repeatedly (e.g. on every animation frame for a moving region).
 */
export function shapeFlow<C>(source: LineSource<C>, region: Region, options: FlowOptions): FlowResult<C> {
  const lineHeight = options.lineHeight;
  const ascent = options.ascent ?? lineHeight * 0.8;
  const multiSpan = options.multiSpan ?? 'fill';
  const align = options.align ?? 'left';
  const minSpanWidth = options.minSpanWidth ?? 1;
  const conservative = options.conservativeBandSampling ?? false;
  const bandSteps = Math.max(1, Math.floor(options.bandSamplingSteps ?? 3));
  const bounds = region.bounds();
  const startY = options.startY ?? bounds.minY;
  const maxY = bounds.maxY;
  const eps = 1e-6;

  const lines: PlacedLine<C>[] = [];
  let cursor = source.start();
  let y = startY;
  let rowIndex = 0;
  let exhausted = false;
  let lastContentBottom = startY;

  while (!exhausted && y + lineHeight <= maxY + eps) {
    const rawSpans = conservative
      ? bandSpans(region, y, lineHeight, bandSteps)
      : region.spansAt(y + lineHeight / 2);
    let spans = rawSpans.filter((s) => s[1] - s[0] >= minSpanWidth);
    if (spans.length > 0) {
      if (multiSpan === 'widest') spans = [widestSpan(spans)];
      else if (multiSpan === 'first') spans = [spans[0]!];

      let spanIndex = 0;
      let placedThisRow = false;
      for (const span of spans) {
        const x0 = span[0];
        const x1 = span[1];
        const width = x1 - x0;
        const line = source.nextLine(cursor, width);
        if (line === null) {
          exhausted = true;
          break;
        }
        if (line.text.length === 0) continue; // span too small to make progress; skip it
        let x = x0;
        if (align === 'right') x = x1 - line.width;
        else if (align === 'center') x = x0 + (width - line.width) / 2;
        // 'justify' is left-anchored: x stays x0 (same as 'left').

        // Compute justified word positions when applicable.
        // Last-line detection: probe one more line from this line's end. This materializes an
        // extra line under Pretext 0.0.1; when the range API ships (measureLineStats / walkLineRanges),
        // replace this with a non-materializing stats call to avoid the extra work.
        let justifiedWords: WordSegment[] | undefined;
        if (align === 'justify' && line.words !== undefined && line.words.length > 1) {
          const probeForLast = source.nextLine(line.end, width);
          const isLastLine = probeForLast === null || probeForLast.text.length === 0;
          if (!isLastLine) {
            // Distribute span width across words: word k's absolute x = x0 + sumWidths[0..k-1] + k*gap.
            const spanWidth = x1 - x0;
            const sumW = line.words.reduce((acc, w) => acc + w.width, 0);
            const gap = (spanWidth - sumW) / (line.words.length - 1);
            // Single left-to-right pass: each word sits after the prior words plus k justified gaps.
            let priorWidths = 0;
            justifiedWords = line.words.map((w, k) => {
              const seg = { text: w.text, x: x0 + priorWidths + k * gap, width: w.width };
              priorWidths += w.width;
              return seg;
            });
          }
        }

        lines.push({
          text: line.text,
          x,
          y,
          baseline: y + ascent,
          width: line.width,
          rowIndex,
          spanIndex,
          start: line.start,
          end: line.end,
          softHyphenated: line.softHyphenated,
          words: justifiedWords,
        });
        cursor = line.end;
        spanIndex++;
        placedThisRow = true;
      }
      if (placedThisRow) lastContentBottom = y + lineHeight;
    }
    y += lineHeight;
    rowIndex++;
  }

  // Overflow = text remained when we ran out of vertical room. Probing does not mutate the source.
  let overflow = false;
  if (!exhausted) {
    const probeWidth = Math.max(1, bounds.maxX - bounds.minX);
    const probe = source.nextLine(cursor, probeWidth);
    overflow = probe !== null && probe.text.length > 0;
  }

  return { lines, overflow, endCursor: cursor, height: lastContentBottom - startY };
}

/**
 * Holds a source so the (expensive) prepare pass is done once, and re-flows cheaply when only the
 * region or options change. This is the reactive-region perf story: build once, reflow() per frame.
 */
export class ShapeFlow<C> {
  constructor(private source: LineSource<C>, private options: FlowOptions) {}
  flow(region: Region): FlowResult<C> {
    return shapeFlow(this.source, region, this.options);
  }
  reflow(region: Region, optionsPatch?: Partial<FlowOptions>): FlowResult<C> {
    return shapeFlow(this.source, region, { ...this.options, ...optionsPatch });
  }
  /**
   * Like `reflow`, but first binary-searches for the narrowest width that preserves the
   * unconstrained line count, then flows through the capped region. This reduces the ragged edge
   * by avoiding a near-empty last line.
   *
   * Delegates to `balancedFlow` from balance.ts so `NarrowedRegion` stays private there.
   */
  rebalance(region: Region, optionsPatch?: Partial<FlowOptions>): FlowResult<C> {
    const merged = { ...this.options, ...optionsPatch };
    return balancedFlow(this.source, region, merged);
  }
}
