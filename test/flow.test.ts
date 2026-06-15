import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shapeFlow, ShapeFlow } from '../src/flow.js';
import { MonospaceLineSource, type MonoCursor } from '../src/line-source.js';
import { rect, circle, subtract } from '../src/region.js';

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
