import { test } from 'node:test';
import assert from 'node:assert/strict';
import { svgPathToPolygon, svgPathToRegion, maskRegion } from '../src/outline-region.js';
import { glyphToRegion } from '../src/glyph-region.js';
import { MonospaceLineSource } from '../src/line-source.js';
import { shapeFlow } from '../src/flow.js';

// ---------------------------------------------------------------------------
// svgPathToPolygon — triangle (M L L Z)
// ---------------------------------------------------------------------------
test('svgPathToPolygon: triangle has 3 corner points', () => {
  const pts = svgPathToPolygon('M 0 0 L 100 0 L 50 100 Z');
  // The polygon should contain the three corner points [0,0], [100,0], [50,100].
  // Z closes back to the first point, so the last added point is [0,0] again —
  // we just check that the three distinct corners appear.
  const hasPoint = (x: number, y: number) =>
    pts.some(([px, py]) => Math.abs(px - x) < 1e-6 && Math.abs(py - y) < 1e-6);
  assert.ok(hasPoint(0, 0), 'missing corner [0,0]');
  assert.ok(hasPoint(100, 0), 'missing corner [100,0]');
  assert.ok(hasPoint(50, 100), 'missing corner [50,100]');
});

test('svgPathToPolygon: triangle region flows text with positive line count', () => {
  const region = svgPathToRegion('M 0 0 L 100 0 L 50 100 Z');
  const src = new MonospaceLineSource(
    'hello world this is a test of flowing text into a triangle shape region',
    6, // 6px per char
  );
  const res = shapeFlow(src, region, { lineHeight: 10, ascent: 8 });
  assert.ok(res.lines.length > 0, 'expected at least one placed line');
  // All lines should be x-contained within [0, 100].
  for (const line of res.lines) {
    assert.ok(line.x >= 0 - 1e-6, `line x ${line.x} < 0`);
    assert.ok(line.x + line.width <= 100 + 1e-6, `line right ${line.x + line.width} > 100`);
  }
});

// ---------------------------------------------------------------------------
// svgPathToPolygon — cubic curve (C) is flattened
// ---------------------------------------------------------------------------
test('svgPathToPolygon: cubic curve flattening produces > 4 points', () => {
  // A cubic arc from (0,0) to (50,0) with control points that bow upward.
  const pts = svgPathToPolygon('M 0 0 C 0 50 50 50 50 0 Z');
  assert.ok(pts.length > 4, `expected > 4 points for a cubic curve, got ${pts.length}`);
  for (const [x, y] of pts) {
    assert.ok(isFinite(x), `non-finite x: ${x}`);
    assert.ok(isFinite(y), `non-finite y: ${y}`);
  }
});

// ---------------------------------------------------------------------------
// svgPathToPolygon — relative commands
// ---------------------------------------------------------------------------
test('svgPathToPolygon: relative commands produce absolute points', () => {
  const pts = svgPathToPolygon('m 10 10 l 10 0 l 0 10 z');
  const hasPoint = (x: number, y: number) =>
    pts.some(([px, py]) => Math.abs(px - x) < 1e-6 && Math.abs(py - y) < 1e-6);
  assert.ok(hasPoint(10, 10), 'missing absolute point [10,10] after relative m');
  assert.ok(hasPoint(20, 10), 'missing absolute point [20,10] after relative l 10 0');
  assert.ok(hasPoint(20, 20), 'missing absolute point [20,20] after relative l 0 10');
});

// ---------------------------------------------------------------------------
// maskRegion
// ---------------------------------------------------------------------------
test('maskRegion: run-length spans on set row', () => {
  // 10×10 alpha grid, row 5 cells 3..6 set to 255.
  const alpha = new Array<number>(10 * 10).fill(0);
  for (let col = 3; col <= 6; col++) alpha[5 * 10 + col] = 255;

  const region = maskRegion(10, 10, alpha);

  // spansAt(5.5) → row = floor(5.5 - 0) = 5 → should see the run [3, 7].
  const spans = region.spansAt(5.5);
  assert.equal(spans.length, 1, `expected 1 span, got ${spans.length}`);
  assert.deepEqual(spans[0], [3, 7]);

  // Row with all-zero alpha → empty.
  assert.deepEqual(region.spansAt(0.5), []);
});

test('maskRegion: origin offsets shift the returned intervals', () => {
  // 5×5 alpha, row 2 fully opaque, origin at (10, 20).
  const alpha = new Array<number>(5 * 5).fill(0);
  for (let col = 0; col < 5; col++) alpha[2 * 5 + col] = 200;

  const region = maskRegion(5, 5, alpha, 128, 10, 20);

  // y=22.5 → row = floor(22.5 - 20) = 2 → should be inside.
  const spans = region.spansAt(22.5);
  assert.equal(spans.length, 1);
  // Interval should be shifted by originX=10.
  assert.deepEqual(spans[0], [10, 15]);

  // y=19 → row = floor(19 - 20) = -1 → outside.
  assert.deepEqual(region.spansAt(19), []);

  // bounds should reflect origin.
  const b = region.bounds();
  assert.equal(b.minX, 10);
  assert.equal(b.minY, 20);
  assert.equal(b.maxX, 15);
  assert.equal(b.maxY, 25);
});

// ---------------------------------------------------------------------------
// glyphToRegion — synthetic glyph-like path
// ---------------------------------------------------------------------------
test('glyphToRegion: synthetic path yields a sane Region', () => {
  // Use a simple square-ish path that mimics what opentype.js might produce.
  const pathData = 'M 10 10 L 60 10 L 60 80 L 10 80 Z';
  const region = glyphToRegion(pathData);

  const b = region.bounds();
  assert.ok(b.minX <= 10 + 1e-6, 'minX too large');
  assert.ok(b.minY <= 10 + 1e-6, 'minY too large');
  assert.ok(b.maxX >= 60 - 1e-6, 'maxX too small');
  assert.ok(b.maxY >= 80 - 1e-6, 'maxY too small');

  // Interior scanline should produce one span covering the shape.
  const spans = region.spansAt(45);
  assert.equal(spans.length, 1, 'expected one span at midpoint');
  assert.ok(spans[0]![0] >= 10 - 1e-6, 'span left too small');
  assert.ok(spans[0]![1] <= 60 + 1e-6, 'span right too large');

  // Outside scanline.
  assert.deepEqual(region.spansAt(0), [], 'expected empty spans above shape');
  assert.deepEqual(region.spansAt(90), [], 'expected empty spans below shape');
});
