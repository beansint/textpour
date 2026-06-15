import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MonospaceLineSource } from '../src/line-source.js';
import { insertSoftHyphens } from '../src/hyphen.js';

const SH = '­'; // soft hyphen

// ---------------------------------------------------------------------------
// MonospaceLineSource soft-hyphen vectors
// ---------------------------------------------------------------------------

test('MonospaceLineSource soft-hyphen: breaks at each soft hyphen when width=30', () => {
  // text = "ab" + SH + "cd" + SH + "ef", charWidth=10, maxWidth=30
  // maxChars = floor(30/10) = 3 visible chars per line
  // Line 1: see "ab", then SH (break oppty with '-' → "ab-" fits in 3), then "cd" would overflow
  //          → break at SH: text="ab-", softHyphenated=true, width=30
  // Line 2: starts after SH, sees "cd", then SH (break oppty "cd-" fits in 3), then "ef" overflows
  //          → break at SH: text="cd-", softHyphenated=true, width=30
  // Line 3: starts after SH, sees "ef" → text="ef", width=20, softHyphenated=falsy
  const text = 'ab' + SH + 'cd' + SH + 'ef';
  const src = new MonospaceLineSource(text, 10);

  const line1 = src.nextLine(src.start(), 30);
  assert.ok(line1 !== null, 'expected line 1');
  assert.equal(line1.text, 'ab-', 'line 1 text should be "ab-"');
  assert.equal(line1.width, 30, 'line 1 width should be 30');
  assert.equal(line1.softHyphenated, true, 'line 1 should be softHyphenated');

  const line2 = src.nextLine(line1.end, 30);
  assert.ok(line2 !== null, 'expected line 2');
  assert.equal(line2.text, 'cd-', 'line 2 text should be "cd-"');
  assert.equal(line2.width, 30, 'line 2 width should be 30');
  assert.equal(line2.softHyphenated, true, 'line 2 should be softHyphenated');

  const line3 = src.nextLine(line2.end, 30);
  assert.ok(line3 !== null, 'expected line 3');
  assert.equal(line3.text, 'ef', 'line 3 text should be "ef"');
  assert.equal(line3.width, 20, 'line 3 width should be 20');
  assert.ok(!line3.softHyphenated, 'line 3 should NOT be softHyphenated');

  const line4 = src.nextLine(line3.end, 30);
  assert.equal(line4, null, 'expected null after all text consumed');
});

test('MonospaceLineSource soft-hyphen: unchosen SH is invisible when width=100', () => {
  // text = "ab" + SH + "cd", charWidth=10, maxWidth=100
  // maxChars = 10, so "abcd" (4 visible chars) fits on one line
  // SH is NOT chosen → invisible → text="abcd", width=40, softHyphenated=falsy
  const text = 'ab' + SH + 'cd';
  const src = new MonospaceLineSource(text, 10);

  const line1 = src.nextLine(src.start(), 100);
  assert.ok(line1 !== null, 'expected a line');
  assert.equal(line1.text, 'abcd', 'text should be "abcd" (SH invisible)');
  assert.equal(line1.width, 40, 'width should be 40 (4 visible chars × 10)');
  assert.ok(!line1.softHyphenated, 'softHyphenated should be falsy');

  const line2 = src.nextLine(line1.end, 100);
  assert.equal(line2, null, 'expected null after all text consumed');
});

// ---------------------------------------------------------------------------
// insertSoftHyphens tests
// ---------------------------------------------------------------------------

test('insertSoftHyphens: round-trip invariant — stripping SH restores original', () => {
  const inputs = [
    '',
    'hello',
    'a quick brown fox',
    'internationalization',
    'Hello, World! 123 — café naïve résumé',
    '日本語テスト mixed with English',
    'supercalifragilistic and antiestablishment',
  ];
  for (const t of inputs) {
    const result = insertSoftHyphens(t);
    const stripped = result.replaceAll(SH, '');
    assert.equal(stripped, t, `round-trip failed for: "${t}"`);
  }
});

test('insertSoftHyphens: short word "cat" is unchanged (length < minWordLength=8)', () => {
  assert.equal(insertSoftHyphens('cat'), 'cat');
  assert.equal(insertSoftHyphens('dog'), 'dog');
  assert.equal(insertSoftHyphens('testing'), 'testing'); // length=7 < 8
});

test('insertSoftHyphens: long Latin word gets at least one SH', () => {
  // "internationalization" is 20 chars, all Latin letters
  const result = insertSoftHyphens('internationalization');
  assert.ok(result.includes(SH), 'expected at least one soft hyphen in "internationalization"');
});

test('insertSoftHyphens: no SH within minPrefix/minSuffix of a word', () => {
  const minPrefix = 3;
  const minSuffix = 3;
  const word = 'internationalization'; // 20 chars
  const result = insertSoftHyphens(word, { minPrefix, minSuffix });
  // Strip SH and check the word is preserved.
  assert.equal(result.replaceAll(SH, ''), word);
  // Find positions of SH within result and verify they map to valid positions in the word.
  let wordIdx = 0;
  for (let i = 0; i < result.length; i++) {
    if (result[i] === SH) {
      // wordIdx is the number of non-SH chars seen so far = position in original word after which SH is inserted.
      assert.ok(wordIdx >= minPrefix, `SH too close to prefix at word pos ${wordIdx}`);
      assert.ok(wordIdx <= word.length - minSuffix, `SH too close to suffix at word pos ${wordIdx}`);
    } else {
      wordIdx++;
    }
  }
});

test('insertSoftHyphens: numbers and punctuation pass through untouched', () => {
  const inputs = [
    '12345678',       // digits
    '3.14159265',     // float
    '!!!???...',      // punctuation
    '2024-06-16',    // date
  ];
  for (const t of inputs) {
    const result = insertSoftHyphens(t);
    assert.equal(result, t, `expected "${t}" to pass through unchanged`);
  }
});

test('insertSoftHyphens: no two consecutive soft hyphens', () => {
  const words = ['internationalization', 'antiestablishment', 'supercalifragilistic'];
  for (const w of words) {
    const result = insertSoftHyphens(w);
    assert.ok(!result.includes(SH + SH), `found consecutive SH in result of "${w}": ${result}`);
  }
});
