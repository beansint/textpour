import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shapeFlow, ShapeFlow } from '../src/flow.js';
import { MonospaceLineSource, type MonoCursor } from '../src/line-source.js';
import { rect, circle, subtract, polygon } from '../src/region.js';

const LOREM =
  'the quick brown fox jumps over the lazy dog and then keeps running across the wide open field ' +
  'under a bright sky while the river flows gently beside the old stone bridge near the village';

function source() {
  return new MonospaceLineSource(LOREM, 10); // 10px per char
}

test('rect: all lines stay within the region and fit their width', () => {
  const r = rect(0, 0, 200, 400);
  const res = shapeFlow(source(), r, { lineHeight: 20, ascent: 16 });
  assert.ok(res.lines.length > 0);
  for (const line of res.lines) {
    assert.ok(line.x >= 0 - 1e-6);
    assert.ok(line.x + line.width <= 200 + 1e-6, `line overflows width: "${line.text}"`);
    assert.ok(line.baseline === line.y + 16);
  }
});

test('circle: middle rows can hold wider lines than near-edge rows', () => {
  const c = circle(150, 150, 140);
  const res = shapeFlow(source(), c, { lineHeight: 22, ascent: 17 });
  assert.ok(res.lines.length > 0);
  const byRow = new Map<number, number>();
  for (const l of res.lines) byRow.set(l.rowIndex, Math.max(byRow.get(l.rowIndex) ?? 0, l.width));
  const rows = [...byRow.keys()].sort((a, b) => a - b);
  const midRow = rows[Math.floor(rows.length / 2)]!;
  const edgeRow = rows[0]!;
  assert.ok(byRow.get(midRow)! >= byRow.get(edgeRow)!, 'mid row width >= top row width');
});

test('donut: at least one row is filled across two spans (the cursor trick)', () => {
  const donut = subtract(rect(0, 0, 320, 320), rect(110, 110, 100, 100));
  const res = shapeFlow(source(), donut, { lineHeight: 20, ascent: 16, multiSpan: 'fill' });
  const multiSpanRow = res.lines.some((l) => l.spanIndex === 1);
  assert.ok(multiSpanRow, 'expected a row with spanIndex 1 (text continued past the hole)');
  // The two pieces on a shared row must keep the same y.
  const rowsWithTwo = new Map<number, number[]>();
  for (const l of res.lines) {
    if (!rowsWithTwo.has(l.rowIndex)) rowsWithTwo.set(l.rowIndex, []);
    rowsWithTwo.get(l.rowIndex)!.push(l.y);
  }
  for (const ys of rowsWithTwo.values()) {
    assert.ok(ys.every((v) => v === ys[0]), 'spans on a row share one baseline y');
  }
});

test('overflow flag: tiny region overflows, generous region does not', () => {
  const tiny = shapeFlow(source(), rect(0, 0, 100, 40), { lineHeight: 20 });
  assert.equal(tiny.overflow, true);

  const big = shapeFlow(source(), rect(0, 0, 600, 4000), { lineHeight: 20 });
  assert.equal(big.overflow, false);
  // endCursor should be at/after the end of text when fully placed.
  const end = big.endCursor as MonoCursor;
  assert.ok(end.i >= LOREM.replace(/\s+$/u, '').length - 1);
});

test('alignment: right-align pushes lines to the span right edge', () => {
  const r = rect(0, 0, 300, 400);
  const res = shapeFlow(source(), r, { lineHeight: 20, align: 'right' });
  for (const line of res.lines) {
    assert.ok(Math.abs(line.x + line.width - 300) <= 1e-6 || line.width === 300);
  }
});

test('ShapeFlow.reflow reuses the source and reacts to a changed region', () => {
  const sf = new ShapeFlow<MonoCursor>(source(), { lineHeight: 20 });
  const small = sf.flow(circle(150, 150, 80));
  const large = sf.reflow(circle(150, 150, 150));
  assert.ok(large.lines.length >= small.lines.length === false || large.height >= small.height - 1e-6);
  // A larger region should place at least as much text (fewer overflow leftovers).
  assert.ok(!(small.overflow === false && large.overflow === true));
});

// ---------------------------------------------------------------------------
// Concave polygon (U shape): multi-span verification
// Points trace a U with two prongs separated by a gap at the top:
//   left prong: (0,0)→(100,0)→(100,200)
//   notch:      (100,200)→(200,200)
//   right prong:(200,200)→(200,0)→(300,0)
//   bottom:     (300,0)→(300,300)→(0,300)
// At row-center y ∈ [0,200): two disjoint spans [0,100] and [200,300].
// At row-center y ∈ [200,300): one contiguous span [0,300].
// ---------------------------------------------------------------------------
const U_POINTS: Array<readonly [number, number]> = [
  [0, 0], [100, 0], [100, 200], [200, 200], [200, 0], [300, 0], [300, 300], [0, 300],
];

// Long enough text to fill many rows across the whole shape.
const LONG_TEXT =
  'the quick brown fox jumps over the lazy dog and then keeps running across the wide open field ' +
  'under a bright sky while the river flows gently beside the old stone bridge near the village ' +
  'and the children play in the meadow where flowers bloom and birds sing all day long in peace ' +
  'beyond the hills the sun sets slowly painting the sky with shades of gold and crimson light';

test('concave U-polygon: at least one PlacedLine has spanIndex === 1 (two-span row in the prongs)', () => {
  const uShape = polygon(U_POINTS);
  const res = shapeFlow(
    new MonospaceLineSource(LONG_TEXT, 10),
    uShape,
    { lineHeight: 20, ascent: 16, multiSpan: 'fill' },
  );
  assert.ok(res.lines.length > 0, 'expected lines to be placed in the U shape');
  const hasSpanOne = res.lines.some((l) => l.spanIndex === 1);
  assert.ok(hasSpanOne, 'expected at least one PlacedLine with spanIndex === 1 (text crossed gap between prongs)');
});

test('concave U-polygon: spans on the same rowIndex share the same y', () => {
  const uShape = polygon(U_POINTS);
  const res = shapeFlow(
    new MonospaceLineSource(LONG_TEXT, 10),
    uShape,
    { lineHeight: 20, ascent: 16, multiSpan: 'fill' },
  );
  const rowsY = new Map<number, number[]>();
  for (const l of res.lines) {
    if (!rowsY.has(l.rowIndex)) rowsY.set(l.rowIndex, []);
    rowsY.get(l.rowIndex)!.push(l.y);
  }
  for (const [, ys] of rowsY) {
    assert.ok(ys.every((v) => v === ys[0]!), 'all spans on a shared rowIndex must have the same y');
  }
});

test('concave U-polygon: rows in the joined bottom (center y ∈ [200,300)) have only one span', () => {
  const uShape = polygon(U_POINTS);
  const res = shapeFlow(
    new MonospaceLineSource(LONG_TEXT, 10),
    uShape,
    { lineHeight: 20, ascent: 16, multiSpan: 'fill' },
  );
  // lineHeight=20 → row center = y + 10. Rows whose center ∈ [200,300) have y ∈ [190,290).
  // The first such row: y=190 → center=200 — on the boundary. Use strict > 200 cutoff.
  // Actually at center == 200 the shape's notch top edge is at y=200, so the row at y=190
  // has center=200 which exactly hits the boundary of the notch. To be safe, look at y>=200
  // (center>=210), well inside the joined base.
  const bottomLines = res.lines.filter((l) => l.y >= 200);
  // There must be at least some lines in the bottom section.
  assert.ok(bottomLines.length > 0, 'expected lines placed in the joined bottom of the U');
  // None of them should be spanIndex > 0 (only one interval at those scanlines).
  const badLine = bottomLines.find((l) => l.spanIndex > 0);
  assert.equal(badLine, undefined, 'bottom section rows should have only spanIndex 0 (one span)');
});
