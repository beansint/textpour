/**
 * auto-fit.ts — binary-search the largest font size at which text fits a region without overflow.
 *
 * Performance note: because Pretext's prepare is keyed on (text, font), each size trial requires
 * a fresh prepareWithSegments call. Under PretextLineSource this makes each trial moderately
 * expensive (O(text length) Unicode segmentation). Callers should:
 *   - Keep maxIterations low (default 24 is already generous for 0.5 px tolerance over a
 *     6–96 px range — fewer than 10 iterations converge in practice).
 *   - Cache results when the text and region don't change between frames.
 *   - When the range API ships (measureLineStats / layoutNextLineRange), a non-materializing stats
 *     call from inside the source can shortcut the full shapeFlow pass; slot it in here behind the
 *     makeSource seam without changing this module.
 */

import type { Region } from './region.js';
import type { LineSource } from './line-source.js';
import type { FlowOptions, FlowResult } from './types.js';
import { shapeFlow } from './flow.js';

export interface AutoFitOptions extends FlowOptions {
  /** Smallest font size to try (px). Default: 6. */
  minSizePx?: number;
  /** Largest font size to try (px). Default: 96. */
  maxSizePx?: number;
  /**
   * Stop when hi − lo < tolerance (px). Default: 0.5.
   * The returned sizePx is accurate to within this margin.
   */
  tolerance?: number;
  /** Safety cap on iterations. Default: 24. */
  maxIterations?: number;
  /**
   * When set, lineHeight for each trial = sizePx * lineHeightRatio instead of the fixed
   * opts.lineHeight. Required for the overflow predicate to be monotonic in size (bigger
   * font → taller rows → fewer rows fit → more likely overflow). Without this, a fixed
   * lineHeight means more text fits as charWidth grows but row count is constant, which
   * can break monotonicity.
   */
  lineHeightRatio?: number;
  /**
   * When set, ascent for each trial = sizePx * ascentRatio instead of opts.ascent.
   * Defaults to lineHeightRatio * 0.8 when lineHeightRatio is set and ascentRatio is omitted.
   */
  ascentRatio?: number;
}

export interface AutoFitResult<C> {
  /** The winning font size (px). May be minSizePx if even the minimum overflows. */
  sizePx: number;
  /** The FlowResult at the winning size. overflow===true only when even minSizePx overflowed. */
  result: FlowResult<C>;
}

/**
 * Binary-search the largest sizePx in [minSizePx, maxSizePx] such that shapeFlow does not
 * overflow the region. Returns the best-effort smallest size when all sizes overflow.
 *
 * @param makeSource  Factory called once per trial — returns a LineSource calibrated for sizePx.
 *                    Under Pretext this is a full prepareWithSegments; keep maxIterations small.
 * @param region      The target region (unchanged across trials).
 * @param opts        Flow options plus auto-fit knobs. lineHeight/ascent are overridden per
 *                    iteration when lineHeightRatio / ascentRatio are set.
 */
export function autoFit<C>(
  makeSource: (sizePx: number) => LineSource<C>,
  region: Region,
  opts: AutoFitOptions,
): AutoFitResult<C> {
  const minSizePx = opts.minSizePx ?? 6;
  const maxSizePx = opts.maxSizePx ?? 96;
  const tolerance = opts.tolerance ?? 0.5;
  const maxIterations = opts.maxIterations ?? 24;

  /** Build per-iteration FlowOptions with scaled lineHeight/ascent. */
  function iterOpts(sizePx: number): FlowOptions {
    const lineHeight = opts.lineHeightRatio != null
      ? sizePx * opts.lineHeightRatio
      : opts.lineHeight;
    const ascent = opts.ascentRatio != null
      ? sizePx * opts.ascentRatio
      : opts.lineHeightRatio != null
        ? sizePx * opts.lineHeightRatio * 0.8
        : opts.ascent;
    // Spread the rest of FlowOptions, then override lineHeight/ascent.
    const { minSizePx: _a, maxSizePx: _b, tolerance: _c, maxIterations: _d,
            lineHeightRatio: _e, ascentRatio: _f, ...rest } = opts;
    return { ...rest, lineHeight, ...(ascent !== undefined ? { ascent } : {}) };
  }

  /** Flow once at sizePx. Each call is one full prepare under Pretext — so we reuse results. */
  function flowAt(sizePx: number): FlowResult<C> {
    return shapeFlow(makeSource(sizePx), region, iterOpts(sizePx));
  }

  // Fast paths: check the extremes first (saves iterations in the common case).
  const maxRes = flowAt(maxSizePx);
  if (!maxRes.overflow) return { sizePx: maxSizePx, result: maxRes };
  const minRes = flowAt(minSizePx);
  if (minRes.overflow) return { sizePx: minSizePx, result: minRes };

  // Invariant: lo fits (overflow===false), hi overflows. Track lo's result to avoid re-flowing it.
  let lo = minSizePx;
  let hi = maxSizePx;
  let loResult = minRes;
  let iterations = 0;

  while (hi - lo >= tolerance && iterations < maxIterations) {
    const mid = (lo + hi) / 2;
    const midRes = flowAt(mid);
    if (!midRes.overflow) {
      lo = mid;
      loResult = midRes;
    } else {
      hi = mid;
    }
    iterations++;
  }

  // lo is the largest size that fits; reuse its already-computed result.
  return { sizePx: lo, result: loResult };
}
