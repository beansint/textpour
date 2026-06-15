import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalize,
  unionSpans,
  intersectSpans,
  subtractSpans,
  rect,
  circle,
  polygon,
  subtract,
  intersect,
} from '../src/region.js';
import type { Interval } from '../src/types.js';

test('normalize coalesces overlapping and touching intervals', () => {
  assert.deepEqual(normalize([[0, 10], [5, 15], [20, 25]]), [[0, 15], [20, 25]]);
  assert.deepEqual(normalize([[0, 10], [10, 20]]), [[0, 20]]); // touching merges
  assert.deepEqual(normalize([[5, 5], [3, 1]]), []); // zero/negative width dropped
});

test('intersectSpans returns overlaps only', () => {
  assert.deepEqual(intersectSpans([[0, 10], [20, 30]], [[5, 25]]), [[5, 10], [20, 25]]);
  assert.deepEqual(intersectSpans([[0, 10]], [[10, 20]]), []); // touching -> no overlap
});

test('subtractSpans cuts holes out of a base', () => {
  assert.deepEqual(subtractSpans([[0, 100]], [[40, 60]]), [[0, 40], [60, 100]]);
  assert.deepEqual(subtractSpans([[0, 100]], [[0, 100]]), []);
  assert.deepEqual(subtractSpans([[0, 100]], [[120, 130]]), [[0, 100]]); // disjoint hole
});

test('unionSpans merges two sets', () => {
  assert.deepEqual(unionSpans([[0, 10]], [[8, 20], [30, 40]]), [[0, 20], [30, 40]]);
});

test('RectRegion spans inside, empty outside', () => {
  const r = rect(10, 20, 100, 50); // x10..110, y20..70
  assert.deepEqual(r.spansAt(40), [[10, 110]]);
  assert.deepEqual(r.spansAt(10), []); // above
  assert.deepEqual(r.spansAt(80), []); // below
  assert.deepEqual(r.bounds(), { minX: 10, minY: 20, maxX: 110, maxY: 70 });
});

test('CircleRegion width peaks at the center row', () => {
  const c = circle(100, 100, 50); // r=50
  const mid = c.spansAt(100)![0] as Interval;
  const near = c.spansAt(140)![0] as Interval; // dy=40 -> hc=30
  assert.equal(mid[0], 50);
  assert.equal(mid[1], 150);
  assert.ok(mid[1] - mid[0] > near[1] - near[0], 'center row wider than off-center row');
  assert.deepEqual(c.spansAt(151), []); // outside radius
});

test('PolygonRegion triangle scanline', () => {
  // Triangle apex at top (50,0), base from (0,100) to (100,100).
  const tri = polygon([[50, 0], [100, 100], [0, 100]]);
  const top = tri.spansAt(10); // near apex -> narrow
  const bottom = tri.spansAt(90); // near base -> wide
  assert.equal(top.length, 1);
  assert.equal(bottom.length, 1);
  assert.ok(bottom[0]![1] - bottom[0]![0] > top[0]![1] - top[0]![0]);
});

test('subtract() builds a donut row with two spans (multi-span case)', () => {
  // Outer 0..300 square, inner 100..200 square hole.
  const donut = subtract(rect(0, 0, 300, 300), rect(100, 100, 100, 100));
  const throughHole = donut.spansAt(150);
  assert.deepEqual(throughHole, [[0, 100], [200, 300]]);
  const aboveHole = donut.spansAt(50);
  assert.deepEqual(aboveHole, [[0, 300]]); // single span where there is no hole
});

test('intersect() narrows to the common region', () => {
  const lens = intersect(circle(0, 50, 60), circle(100, 50, 60));
  const spans = lens.spansAt(50);
  assert.equal(spans.length, 1);
  assert.ok(spans[0]![0] >= 40 && spans[0]![1] <= 60); // overlap band only
});
