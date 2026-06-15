/**
 * Tests for conservative band sampling (Phase 1, item 7).
 *
 * A synthetic Region narrows in the MIDDLE of a row band but is wide at the band center. With the
 * default center sampling the row claims the wide span; with conservativeBandSampling the row only
 * claims the x-range inside the shape across the whole band (the narrow part), so text never pokes
 * outside the tight section.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shapeFlow } from '../src/flow.js';
import { MonospaceLineSource } from '../src/line-source.js';
import type { Region } from '../src/region.js';
import type { Interval } from '../src/types.js';

// Row band for the only row is [100, 120) with lineHeight 20, center y = 110.
// Wide [0,100] everywhere EXCEPT a narrow [10,90] band in y ∈ [103, 107] (which the center misses
// but a 3-sample band catches at y ≈ 103.3).
const variableRegion: Region = {
  spansAt(y: number): Interval[] {
    return y >= 103 && y <= 107 ? [[10, 90]] : [[0, 100]];
  },
  bounds() {
    return { minX: 0, minY: 100, maxX: 100, maxY: 120 };
  },
};

const TEXT = 'pour some text into this region to fill the available width on the row';
const OPTS = { lineHeight: 20, ascent: 16 } as const;

test('center sampling (default) uses the wide span [0,100]', () => {
  const res = shapeFlow(new MonospaceLineSource(TEXT, 10), variableRegion, OPTS);
  assert.ok(res.lines.length > 0, 'expected a line placed');
  const first = res.lines[0]!;
  // Center y=110 is outside the narrow band, so the row claims [0,100] → line left at x=0.
  assert.equal(first.x, 0, 'center sampling should place the line at the wide span left (x=0)');
});

test('conservativeBandSampling narrows to the inside-of-whole-band span [10,90]', () => {
  const res = shapeFlow(new MonospaceLineSource(TEXT, 10), variableRegion, {
    ...OPTS,
    conservativeBandSampling: true,
    bandSamplingSteps: 3,
  });
  assert.ok(res.lines.length > 0, 'expected a line placed');
  const first = res.lines[0]!;
  // The band intersection includes the narrow [10,90] sample → line is confined to x>=10.
  assert.equal(first.x, 10, 'conservative sampling should confine the line to the narrow span (x=10)');
  // And its width must not exceed the narrow span width (80px).
  assert.ok(first.width <= 80 + 1e-6, `line width (${first.width}) must fit the narrowed span (80)`);
});

test('conservativeBandSampling defaults to 3 steps when bandSamplingSteps omitted', () => {
  const res = shapeFlow(new MonospaceLineSource(TEXT, 10), variableRegion, {
    ...OPTS,
    conservativeBandSampling: true,
  });
  const first = res.lines[0]!;
  assert.equal(first.x, 10, 'default 3-step band sampling should still catch the narrow section');
});
