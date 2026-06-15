/**
 * Balanced-line width search.
 *
 * Finds the narrowest line width that keeps the same number of lines as the unconstrained layout,
 * reducing the ragged edge by avoiding a near-empty final line.
 *
 * NOTE: this is meaningful for rectangular / near-rectangular regions. For highly variable-width
 * shapes (circles, stars, concave polygons) uniform narrowing is only a hint, not a guarantee —
 * the per-row span width still varies independently of the global maxWidth cap, so balance is best
 * paired with `multiSpan: 'widest'` or `'first'` where the dominant span drives the width.
 *
 * // FUTURE: when Pretext's measureLineStats/walkLineRanges range API ships, use a non-materializing
 * // stats walk instead of full shapeFlow calls per binary-search step.
 */

import type { Region } from './region.js';
import type { Interval, Bounds } from './types.js';
import type { LineSource } from './line-source.js';
import type { FlowOptions, FlowResult } from './types.js';
import { shapeFlow } from './flow.js';

// ---------------------------------------------------------------------------
// NarrowedRegion — caps each span's width at a global maximum.
// Not exported: it is an implementation detail of the binary search.
// ---------------------------------------------------------------------------

class NarrowedRegion implements Region {
  constructor(private inner: Region, private maxWidth: number) {}

  spansAt(y: number): Interval[] {
    return this.inner.spansAt(y).map(([x0, x1]) => [x0, Math.min(x1, x0 + this.maxWidth)] as Interval);
  }

  bounds(): Bounds {
    return this.inner.bounds();
  }
}

// ---------------------------------------------------------------------------
// balanceWidth — public utility
// ---------------------------------------------------------------------------

/**
 * Find the narrowest line width `w` such that flowing `source` through a region whose spans are
 * capped to `w` produces the same number of lines (and the same `overflow` flag) as the full
 * unconstrained layout.
 *
 * The result is determined by binary search (~20 iterations, resolution 0.5 px). Use it to pour
 * text with a more even ragged edge — avoiding a last line that is nearly empty.
 *
 * **Caveat (rectangular / near-rectangular regions):** For shapes with highly variable per-row
 * widths (circles, stars, concave polygons) the uniform width cap is only a hint. The binary
 * search still converges and preserves the line count, but the visual balance improvement is
 * region-specific. Best paired with `multiSpan: 'widest'` or `'first'` for such shapes.
 *
 * // FUTURE: when Pretext's measureLineStats/walkLineRanges range API ships, use a non-materializing
 * // stats walk instead of full shapeFlow calls per binary-search step.
 */
export function balanceWidth(source: LineSource<unknown>, region: Region, options: FlowOptions): number {
  const bounds = region.bounds();
  const fullWidth = bounds.maxX - bounds.minX;

  const base = shapeFlow(source, region, options);
  const baseCount = base.lines.length;

  // One line (or no lines): nothing to balance.
  if (baseCount <= 1) return fullWidth;

  // Binary search for the minimum width that preserves both line count AND overflow flag.
  let lo = 1;
  let hi = fullWidth;
  let best = fullWidth; // fallback: full width always qualifies

  const iterations = 20;
  for (let k = 0; k < iterations && hi - lo > 0.5; k++) {
    const mid = (lo + hi) / 2;
    const candidate = shapeFlow(source, new NarrowedRegion(region, mid), options);
    if (candidate.lines.length === baseCount && candidate.overflow === base.overflow) {
      best = mid;
      hi = mid; // try even narrower
    } else {
      lo = mid; // too narrow — needs more width
    }
  }

  return best;
}

// ---------------------------------------------------------------------------
// balancedFlow — convenience combinator (keeps NarrowedRegion private here)
// ---------------------------------------------------------------------------

/**
 * Compute a balanced layout: finds the narrowest width that preserves the line count of the
 * unconstrained layout, then flows through the capped region.
 *
 * This is equivalent to:
 *   `shapeFlow(source, narrowedRegion(region, balanceWidth(source, region, options)), options)`
 * but keeps `NarrowedRegion` private to this module.
 *
 * **Caveat:** see `balanceWidth` — most effective for rectangular / near-rectangular regions.
 *
 * // FUTURE: when Pretext's measureLineStats/walkLineRanges range API ships, use a non-materializing
 * // stats walk instead of full shapeFlow calls per binary-search step.
 */
export function balancedFlow<C>(source: LineSource<C>, region: Region, options: FlowOptions): FlowResult<C> {
  const w = balanceWidth(source, region, options);
  return shapeFlow(source, new NarrowedRegion(region, w), options);
}
