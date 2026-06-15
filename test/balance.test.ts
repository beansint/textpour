/**
 * Tests for balanceWidth / balancedFlow (Phase 1, item 4).
 *
 * All tests use MonospaceLineSource + rect — no Pretext, no canvas.
 *
 * Layout mechanics (charWidth=10): maxChars = floor(width / 10), greedy word wrap on spaces.
 *
 * The headline test uses a classic "balance" case where the UNCONSTRAINED layout leaves a
 * one-word last line, and balancing redistributes a word down so the lines are more even:
 *
 *   TEXT = "The quick brown fox jumps"  (charWidth=10, rect width 200 → maxChars=20)
 *   Unconstrained: "The quick brown fox" (190px) / "jumps" (50px)   ← lopsided
 *   Balanced (cap ~150): "The quick brown" (150px) / "fox jumps" (90px)  ← evened out
 *
 * So balancing must STRICTLY shrink the first line and grow the last — proving it does real work,
 * not just report a width.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { balanceWidth, balancedFlow } from '../src/balance.js';
import { shapeFlow } from '../src/flow.js';
import { MonospaceLineSource } from '../src/line-source.js';
import { rect } from '../src/region.js';

const TEXT = 'The quick brown fox jumps';
const CHAR_WIDTH = 10;
const RECT_W = 200;
const RECT_H = 400;
const OPTS = { lineHeight: 20, ascent: 16 };

test('balanceWidth: narrows width below fullWidth', () => {
  const src = new MonospaceLineSource(TEXT, CHAR_WIDTH);
  const region = rect(0, 0, RECT_W, RECT_H);

  const w = balanceWidth(src, region, OPTS);

  assert.ok(w < RECT_W, `expected balanceWidth (${w}) < fullWidth (${RECT_W})`);
  assert.ok(w > 0, `expected balanceWidth (${w}) > 0`);
});

test('balancedFlow: preserves unconstrained line count', () => {
  const src = new MonospaceLineSource(TEXT, CHAR_WIDTH);
  const region = rect(0, 0, RECT_W, RECT_H);

  const unconstrained = shapeFlow(src, region, OPTS);
  const balanced = balancedFlow(src, region, OPTS);

  assert.equal(unconstrained.lines.length, 2, 'sanity: unconstrained is 2 lines');
  assert.equal(
    balanced.lines.length,
    unconstrained.lines.length,
    `balanced line count (${balanced.lines.length}) must equal unconstrained (${unconstrained.lines.length})`,
  );
});

test('balancedFlow: no overflow introduced', () => {
  const src = new MonospaceLineSource(TEXT, CHAR_WIDTH);
  const region = rect(0, 0, RECT_W, RECT_H);

  const balanced = balancedFlow(src, region, OPTS);

  assert.equal(balanced.overflow, false, 'balanced layout must not overflow');
});

test('balancedFlow: actually redistributes — last line grows, first line shrinks', () => {
  // This is the real proof the feature works (not a no-op): the lopsided
  // "The quick brown fox" / "jumps" must become more even.
  const src = new MonospaceLineSource(TEXT, CHAR_WIDTH);
  const region = rect(0, 0, RECT_W, RECT_H);

  const unconstrained = shapeFlow(src, region, OPTS);
  const balanced = balancedFlow(src, region, OPTS);

  const firstUn = unconstrained.lines[0]!;
  const lastUn = unconstrained.lines[unconstrained.lines.length - 1]!;
  const firstBal = balanced.lines[0]!;
  const lastBal = balanced.lines[balanced.lines.length - 1]!;

  // Last line strictly longer (more words pushed down).
  assert.ok(
    lastBal.width > lastUn.width,
    `balanced last line (${lastBal.width}) should be strictly wider than unconstrained (${lastUn.width})`,
  );
  // First line strictly shorter (narrower cap).
  assert.ok(
    firstBal.width < firstUn.width,
    `balanced first line (${firstBal.width}) should be strictly narrower than unconstrained (${firstUn.width})`,
  );
  // The ragged edge is more even: the spread between longest and shortest line shrinks.
  const spreadUn = firstUn.width - lastUn.width;
  const spreadBal = Math.abs(firstBal.width - lastBal.width);
  assert.ok(spreadBal < spreadUn, `balanced spread (${spreadBal}) should be smaller than unconstrained (${spreadUn})`);
});

test('balanceWidth: single-line text returns fullWidth (nothing to balance)', () => {
  // "hello" = 5 chars = 50px, fits in one line in a 200px-wide rect.
  const src = new MonospaceLineSource('hello', CHAR_WIDTH);
  const region = rect(0, 0, RECT_W, RECT_H);

  const w = balanceWidth(src, region, OPTS);

  assert.equal(w, RECT_W, 'single-line text: balanceWidth must return fullWidth');
});

test('balancedFlow single-line text: lines.length stays 1', () => {
  const src = new MonospaceLineSource('hello world', CHAR_WIDTH);
  const region = rect(0, 0, RECT_W, RECT_H); // "hello world" = 11 chars, fits in one line

  const unconstrained = shapeFlow(src, region, OPTS);
  const balanced = balancedFlow(src, region, OPTS);

  assert.equal(unconstrained.lines.length, 1, 'unconstrained must be 1 line');
  assert.equal(balanced.lines.length, 1, 'balanced must remain 1 line');
  assert.equal(balanced.overflow, false);
});

test('balanceWidth + balancedFlow: consistent — flowing with the returned width gives same line count', () => {
  const src = new MonospaceLineSource(TEXT, CHAR_WIDTH);
  const region = rect(0, 0, RECT_W, RECT_H);

  const w = balanceWidth(src, region, OPTS);
  const unconstrained = shapeFlow(src, region, OPTS);

  // A plain narrow rect and NarrowedRegion behave the same for a RectRegion source.
  const narrowed = shapeFlow(src, rect(0, 0, w, RECT_H), OPTS);
  const balanced = balancedFlow(src, region, OPTS);

  assert.equal(narrowed.lines.length, unconstrained.lines.length);
  assert.equal(balanced.lines.length, unconstrained.lines.length);
});
