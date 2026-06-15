import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPrefixWidths,
  xToGraphemeIndex,
  graphemeIndexToX,
  type TextMeasurer,
} from '../src/prefix-widths.js';

// Fake measurer: 7px per code point. Lets us test geometry without a real canvas font.
const fake: TextMeasurer = { measure: (t) => Array.from(t).length * 7 };

test('buildPrefixWidths produces cumulative boundaries', () => {
  assert.deepEqual(buildPrefixWidths('abcd', fake), [0, 7, 14, 21, 28]);
});

test('grapheme-aware: an emoji counts as one boundary', () => {
  const prefix = buildPrefixWidths('\u{1F44D}a', fake); // 👍 + a
  assert.equal(prefix.length, 3); // 2 graphemes -> 3 boundaries
  assert.deepEqual(prefix, [0, 7, 14]);
});

test('xToGraphemeIndex snaps to the nearer boundary', () => {
  const prefix = buildPrefixWidths('abcd', fake); // [0,7,14,21,28]
  assert.equal(xToGraphemeIndex(prefix, 0), 0);
  assert.equal(xToGraphemeIndex(prefix, 3), 0); // closer to 0 than 7
  assert.equal(xToGraphemeIndex(prefix, 4), 1); // closer to 7
  assert.equal(xToGraphemeIndex(prefix, 100), 4); // clamps to last
});

test('indexToX is the inverse at boundaries', () => {
  const prefix = buildPrefixWidths('abcd', fake);
  for (let i = 0; i < prefix.length; i++) {
    assert.equal(graphemeIndexToX(prefix, i), prefix[i]);
    assert.equal(xToGraphemeIndex(prefix, prefix[i]!), i);
  }
});
