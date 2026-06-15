/**
 * Conservative heuristic soft-hyphen insertion.
 *
 * IMPORTANT: this is a HEURISTIC, NOT a dictionary hyphenator. It does not consult any word list,
 * pronunciation data, or language-specific hyphenation rules. It uses simple vowel→consonant
 * boundary detection for Latin text only. For professional-quality hyphenation, use a dictionary
 * hyphenator (e.g. Hyphenopoly / hypher) and pre-process your text before calling `insertSoftHyphens`.
 *
 * The `locale` option is reserved for future use (it is passed to `Intl.Segmenter` but has no effect
 * on the heuristic itself, which is purely structural for now).
 *
 * INVARIANT: `insertSoftHyphens(t).replaceAll('­', '') === t` for all string inputs.
 */

const SOFT_HYPHEN = '­';
const VOWELS = new Set(['a', 'e', 'i', 'o', 'u', 'A', 'E', 'I', 'O', 'U']);
const LATIN_WORD = /^[A-Za-z]+$/;

export interface InsertSoftHyphensOptions {
  /** Minimum word length (chars) before inserting any soft hyphens. Default: 8. */
  minWordLength?: number;
  /** Never insert within the first N characters of a word. Default: 3. */
  minPrefix?: number;
  /** Never insert within the last N characters of a word. Default: 3. */
  minSuffix?: number;
  /** Reserved for future use — passed to `Intl.Segmenter`. Default: undefined (host locale). */
  locale?: string;
}

/**
 * Insert U+00AD (soft hyphen) at heuristic break points in long Latin words.
 *
 * Only Latin alphabetic words (`/^[A-Za-z]+$/`) of at least `minWordLength` characters are
 * processed. Within such words, soft hyphens are placed at vowel→consonant boundaries, never
 * within the first `minPrefix` or last `minSuffix` characters, and never two in a row. All other
 * text (numbers, punctuation, CJK, emoji, short words) passes through unchanged.
 *
 * @param text    The input string.
 * @param opts    Optional configuration (see {@link InsertSoftHyphensOptions}).
 * @returns       A copy of `text` with soft hyphens inserted. Stripping all U+00AD restores
 *                the original: `result.replaceAll('­', '') === text`.
 */
export function insertSoftHyphens(text: string, opts: InsertSoftHyphensOptions = {}): string {
  const minWordLength = opts.minWordLength ?? 8;
  const minPrefix = opts.minPrefix ?? 3;
  const minSuffix = opts.minSuffix ?? 3;
  const locale = opts.locale;

  const segmenter = new Intl.Segmenter(locale, { granularity: 'word' });
  const segments = segmenter.segment(text);

  let result = '';
  for (const seg of segments) {
    const word = seg.segment;
    if (
      seg.isWordLike &&
      LATIN_WORD.test(word) &&
      word.length >= minWordLength
    ) {
      result += hyphenateWord(word, minPrefix, minSuffix);
    } else {
      result += word;
    }
  }
  return result;
}

/**
 * Insert soft hyphens into a single Latin word at vowel→consonant boundaries.
 * Never within first `minPrefix` or last `minSuffix` chars; never two in a row.
 */
function hyphenateWord(word: string, minPrefix: number, minSuffix: number): string {
  const len = word.length;
  // The zone where we may insert: [minPrefix, len - minSuffix)
  // If that range is empty, return unchanged.
  if (minPrefix + minSuffix >= len) return word;

  let out = '';
  let lastInsert = -2; // index of last soft-hyphen insertion (prevent consecutive)
  for (let i = 0; i < len; i++) {
    out += word[i]!;
    // Candidate position is AFTER character i, i.e. between i and i+1.
    // Must be within the allowed zone: i+1 >= minPrefix AND i+1 <= len - minSuffix
    // i.e. i >= minPrefix - 1 AND i < len - minSuffix
    const afterI = i + 1;
    if (
      afterI >= minPrefix &&
      afterI <= len - minSuffix &&
      i !== lastInsert + 1 // no two in a row
    ) {
      const cur = word[i]!;
      const next = word[i + 1];
      // Vowel→consonant boundary: current is a vowel, next is a consonant.
      if (next !== undefined && VOWELS.has(cur) && !VOWELS.has(next)) {
        out += SOFT_HYPHEN;
        lastInsert = i;
      }
    }
  }
  return out;
}
