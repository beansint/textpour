// The seam that decouples the shape-flow orchestrator from any specific text engine.
// The orchestrator only knows LineSource, so it is testable in Node with no canvas/Pretext,
// and the same seam lets an HTML-in-Canvas planner reuse the geometry without changes.

/** One line produced by a source, with cursors back into the source. */
export interface Line<C> {
  text: string;
  width: number;
  start: C;
  end: C;
  /** True when a soft hyphen (U+00AD) was chosen as the line-break point and a visible '-' was appended. */
  softHyphenated?: boolean;
}

export interface LineSource<C> {
  /** The cursor at the very start of the text. */
  start(): C;
  /**
   * Return the next line that fits within `maxWidth` starting from `cursor`,
   * or null when the text is exhausted. Implementations MUST make progress
   * (emit >= 1 grapheme) whenever text remains, even if maxWidth is tiny.
   */
  nextLine(cursor: C, maxWidth: number): Line<C> | null;
}

/** Cursor for the monospace source: an index into the grapheme array. */
export interface MonoCursor {
  i: number;
}

const SOFT_HYPHEN = '­';

/**
 * Deterministic, dependency-free source for unit tests and offline demos.
 * Fixed advance width per grapheme, word-aware greedy wrapping with hard-break fallback.
 * Supports U+00AD soft hyphens: unchosen soft hyphens are invisible (zero width); when a soft
 * hyphen is chosen as the break point the displayed text gains a trailing '-' and softHyphenated=true.
 * Not for production rendering — it ignores kerning, shaping, bidi, and real fonts.
 */
export class MonospaceLineSource implements LineSource<MonoCursor> {
  private graphemes: string[];
  constructor(text: string, private charWidth = 10) {
    this.graphemes = Array.from(text); // code-point granularity is sufficient for tests
  }
  start(): MonoCursor {
    return { i: 0 };
  }
  nextLine(cursor: MonoCursor, maxWidth: number): Line<MonoCursor> | null {
    const g = this.graphemes;
    let i = cursor.i;
    if (i >= g.length) return null;
    // Collapse leading spaces at the start of a line (browser-like).
    // Leading soft hyphens are NOT collapsed — they are invisible but not whitespace.
    while (i < g.length && g[i] === ' ') i++;
    if (i >= g.length) return null;

    // Discard any stray leading soft hyphens (invisible, zero-width).
    while (i < g.length && g[i] === SOFT_HYPHEN) i++;
    if (i >= g.length) return null;

    const maxChars = Math.max(1, Math.floor(maxWidth / this.charWidth));
    const lineStart = i;

    // Walk forward, counting only VISIBLE characters (excluding soft hyphens).
    // Track the latest break opportunity: space index OR soft-hyphen index.
    // breakKind: 'space' means break before lastBreak, 'softhyphen' means break after it (append '-').
    let end = i;
    let visibleCount = 0;
    let lastBreakEnd = -1;   // source index AFTER the break (where next line starts)
    let lastBreakKind: 'space' | 'softhyphen' | null = null;

    while (end < g.length) {
      const ch = g[end]!;
      if (ch === SOFT_HYPHEN) {
        // A soft hyphen is a break opportunity. If appending '-' would still fit, record it.
        // The '-' counts as 1 visible char.
        if (visibleCount + 1 <= maxChars) {
          lastBreakEnd = end + 1; // consume the soft hyphen
          lastBreakKind = 'softhyphen';
        }
        end++;
        // Soft hyphen is NOT counted in visibleCount.
        continue;
      }
      if (ch === ' ') {
        // Space is a break opportunity (break BEFORE it, existing behavior).
        lastBreakEnd = end;
        lastBreakKind = 'space';
      }
      if (visibleCount >= maxChars) {
        // Reached the limit — don't consume this character.
        break;
      }
      visibleCount++;
      end++;
    }

    // Determine if we stopped because we ran out of characters (exhausted) or hit the limit.
    const hitLimit = end < g.length && g[end] !== ' ' && g[end] !== SOFT_HYPHEN;

    // If we hit the limit mid-word and have an earlier break, back up to it.
    if (hitLimit && lastBreakEnd > lineStart && lastBreakKind !== null) {
      if (lastBreakKind === 'space') {
        // Break before the space: end = space index, next line starts there.
        const spaceIdx = lastBreakEnd;
        const raw = g.slice(lineStart, spaceIdx).filter(c => c !== SOFT_HYPHEN).join('');
        const text = raw.replace(/\s+$/u, '');
        const width = Array.from(text).length * this.charWidth;
        return { text, width, start: { i: lineStart }, end: { i: spaceIdx } };
      } else {
        // lastBreakKind === 'softhyphen'
        // Break at/after the soft hyphen: append '-', next line starts after soft hyphen.
        const raw = g.slice(lineStart, lastBreakEnd - 1).filter(c => c !== SOFT_HYPHEN).join('');
        const text = raw + '-';
        const width = Array.from(text).length * this.charWidth;
        return { text, width, softHyphenated: true, start: { i: lineStart }, end: { i: lastBreakEnd } };
      }
    }

    // No overflow or no usable break — take everything up to `end`, strip soft hyphens.
    // Guarantee at least 1 visible grapheme progress (skip all-soft-hyphen edge case).
    if (end === lineStart) {
      // All remaining chars from lineStart were soft hyphens with no visible char — force progress.
      end = lineStart + 1;
    }

    const raw = g.slice(lineStart, end).filter(c => c !== SOFT_HYPHEN).join('');
    const text = raw.replace(/\s+$/u, '');
    // If text is empty but end advanced, we need to guarantee progress on the cursor.
    if (text.length === 0) {
      // Skip to end (all soft hyphens / spaces — shouldn't normally happen post the leading collapse).
      const width = 0;
      return { text: '', width, start: { i: lineStart }, end: { i: end } };
    }
    const width = Array.from(text).length * this.charWidth;
    return { text, width, start: { i: lineStart }, end: { i: end } };
  }
}
