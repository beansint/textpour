/**
 * auto-fit.test.ts — unit tests for autoFit().
 *
 * All tests use MonospaceLineSource so no Pretext / Canvas2D is needed at runtime.
 * Each trial: makeSource(px) = new MonospaceLineSource(TEXT, px)  (charWidth = px).
 * lineHeightRatio: 1.4 → lineHeight = 1.4 * px, ascent = 1.12 * px (ratio * 0.8 default).
 *
 * Determinism reasoning for the main test:
 *   TEXT = "hello world foo bar" (19 visible chars, 3 spaces → 3 word-break points)
 *   region = rect(0, 0, 200, 200)  (200×200 px)
 *
 *   For a given sizePx s:
 *     charWidth = s, lineHeight = 1.4*s
 *     chars per line = floor(200 / s)
 *     rows that fit  = floor(200 / (1.4*s))
 *     max chars total = chars_per_line × rows
 *
 *   TEXT has 19 visible chars (spaces count in greedy wrap), so we need:
 *     floor(200 / s) × floor(200 / (1.4*s)) >= 19
 *
 *   At s=10: 20 × 14 = 280 >= 19 → fits
 *   At s=20: 10 × 7  = 70  >= 19 → fits
 *   At s=30: 6  × 4  = 24  >= 19 → fits
 *   At s=40: 5  × 3  = 15  < 19  → overflows (only ~5*3=15 chars of capacity)
 *   At s=35: 5  × 4  = 20  >= 19 → fits (floor(200/35)=5, floor(200/49)=4)
 *   At s=36: 5  × 3  = 15  < 19  → overflow (floor(200/36)=5, floor(200/50.4)=3)
 *
 *   So the true boundary is between 35 and 36. autoFit with tolerance=0.5 should converge
 *   to a sizePx in [35, 36) and the result must be overflow===false.
 *   A size of sizePx + 2*tolerance (≥ 36) must overflow.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoFit } from '../src/auto-fit.js';
import { MonospaceLineSource } from '../src/line-source.js';
import { shapeFlow } from '../src/flow.js';
import { rect } from '../src/region.js';

const TEXT = 'hello world foo bar';

function makeSource(px: number) {
  return new MonospaceLineSource(TEXT, px);
}

const REGION = rect(0, 0, 200, 200);
const LINE_HEIGHT_RATIO = 1.4;

// ---------------------------------------------------------------------------
// Main test: converges to the largest fitting size, within tolerance.
// ---------------------------------------------------------------------------
test('autoFit: returns a size that fits and a slightly larger size overflows', () => {
  const tolerance = 0.5;
  const { sizePx, result } = autoFit(makeSource, REGION, {
    lineHeight: 0, // overridden by lineHeightRatio
    lineHeightRatio: LINE_HEIGHT_RATIO,
    minSizePx: 6,
    maxSizePx: 96,
    tolerance,
  });

  // The winning size must not overflow.
  assert.equal(result.overflow, false, `sizePx=${sizePx} should fit without overflow`);

  // A slightly larger size (beyond tolerance) must overflow — confirming we found the maximum.
  const largerSize = sizePx + 2 * tolerance;
  const largerResult = shapeFlow(
    makeSource(largerSize),
    REGION,
    { lineHeight: largerSize * LINE_HEIGHT_RATIO },
  );
  assert.equal(
    largerResult.overflow,
    true,
    `sizePx+2*tol=${largerSize} should overflow (autoFit should not have returned a sub-optimal size)`,
  );
});

// ---------------------------------------------------------------------------
// Edge: region so large that maxSizePx fits → returns maxSizePx immediately.
// ---------------------------------------------------------------------------
test('autoFit: very large region → returns maxSizePx', () => {
  // 2000×2000 px region easily fits TEXT at any size.
  const bigRegion = rect(0, 0, 2000, 2000);
  const maxSizePx = 96;
  const { sizePx, result } = autoFit(makeSource, bigRegion, {
    lineHeight: 0,
    lineHeightRatio: LINE_HEIGHT_RATIO,
    minSizePx: 6,
    maxSizePx,
    tolerance: 0.5,
  });
  assert.equal(sizePx, maxSizePx, 'should return maxSizePx when it fits');
  assert.equal(result.overflow, false, 'result at maxSizePx should not overflow');
});

// ---------------------------------------------------------------------------
// Edge: region so tiny that even minSizePx overflows → returns minSizePx best-effort.
// ---------------------------------------------------------------------------
test('autoFit: tiny region → returns minSizePx with overflow===true', () => {
  // 1×1 px region — cannot fit even a single character at any size.
  const tinyRegion = rect(0, 0, 1, 1);
  const minSizePx = 6;
  const { sizePx, result } = autoFit(makeSource, tinyRegion, {
    lineHeight: 0,
    lineHeightRatio: LINE_HEIGHT_RATIO,
    minSizePx,
    maxSizePx: 96,
    tolerance: 0.5,
  });
  assert.equal(sizePx, minSizePx, 'should return minSizePx when nothing fits');
  assert.equal(result.overflow, true, 'result must have overflow===true (best-effort)');
});

// ---------------------------------------------------------------------------
// Respects custom minSizePx / maxSizePx bounds.
// ---------------------------------------------------------------------------
test('autoFit: respects custom minSizePx and maxSizePx', () => {
  // Constrain the search to [20, 30]. TEXT/REGION still fits at 20 and overflows at 30+
  // (from the reasoning above: s=30 fits, s=36 overflows; within [20,30] maxSizePx=30 fits).
  const { sizePx, result } = autoFit(makeSource, REGION, {
    lineHeight: 0,
    lineHeightRatio: LINE_HEIGHT_RATIO,
    minSizePx: 20,
    maxSizePx: 30,
    tolerance: 0.5,
  });
  assert.equal(result.overflow, false, `size ${sizePx} within [20,30] should fit`);
  assert.ok(sizePx <= 30 + 1e-9, 'sizePx must not exceed maxSizePx');
  assert.ok(sizePx >= 20 - 1e-9, 'sizePx must not be below minSizePx');
});

// ---------------------------------------------------------------------------
// maxIterations cap: algorithm stops early but still returns a consistent result.
// ---------------------------------------------------------------------------
test('autoFit: maxIterations=1 still returns a valid result', () => {
  const { sizePx, result } = autoFit(makeSource, REGION, {
    lineHeight: 0,
    lineHeightRatio: LINE_HEIGHT_RATIO,
    minSizePx: 6,
    maxSizePx: 96,
    tolerance: 0.5,
    maxIterations: 1,
  });
  // After 1 iteration we may not have converged, but the result must be self-consistent:
  // if overflow===false then sizePx genuinely fits; if overflow===true then sizePx===minSizePx.
  if (result.overflow) {
    assert.equal(sizePx, 6, 'overflow result must be at minSizePx');
  } else {
    // Verify the result is actually consistent with the returned size.
    const check = shapeFlow(makeSource(sizePx), REGION, { lineHeight: sizePx * LINE_HEIGHT_RATIO });
    assert.equal(check.overflow, false, 'returned sizePx must genuinely fit');
  }
});

// ---------------------------------------------------------------------------
// ascentRatio: explicit ascentRatio is respected.
// ---------------------------------------------------------------------------
test('autoFit: explicit ascentRatio is used in the final FlowResult', () => {
  const { sizePx, result } = autoFit(makeSource, REGION, {
    lineHeight: 0,
    lineHeightRatio: LINE_HEIGHT_RATIO,
    ascentRatio: 0.9,
    minSizePx: 6,
    maxSizePx: 96,
    tolerance: 0.5,
  });
  // Verify the baselines are consistent with ascentRatio=0.9 (baseline = y + sizePx*0.9).
  assert.equal(result.overflow, false);
  for (const line of result.lines) {
    const expectedBaseline = line.y + sizePx * 0.9;
    assert.ok(
      Math.abs(line.baseline - expectedBaseline) < 1e-6,
      `baseline (${line.baseline}) should equal y + sizePx*0.9 (${expectedBaseline})`,
    );
  }
});
