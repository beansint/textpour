// The seam that decouples the shape-flow orchestrator from any specific text engine.
// The orchestrator only knows LineSource, so it is testable in Node with no canvas/Pretext,
// and the same seam lets an HTML-in-Canvas planner reuse the geometry without changes.

/** One line produced by a source, with cursors back into the source. */
export interface Line<C> {
  text: string;
  width: number;
  start: C;
  end: C;
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

/**
 * Deterministic, dependency-free source for unit tests and offline demos.
 * Fixed advance width per grapheme, word-aware greedy wrapping with hard-break fallback.
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
    while (i < g.length && g[i] === ' ') i++;
    if (i >= g.length) return null;

    const maxChars = Math.max(1, Math.floor(maxWidth / this.charWidth));
    const lineStart = i;
    let end = i;
    let lastBreak = -1;
    while (end < g.length && end - lineStart < maxChars) {
      if (g[end] === ' ') lastBreak = end;
      end++;
    }
    // Cut mid-word with an earlier break available -> back up to it (word wrap).
    if (end < g.length && g[end] !== ' ' && lastBreak > lineStart) end = lastBreak;
    if (end === lineStart) end = lineStart + 1; // guarantee progress

    const raw = g.slice(lineStart, end).join('');
    const text = raw.replace(/\s+$/u, '');
    const width = Array.from(text).length * this.charWidth;
    return { text, width, start: { i: lineStart }, end: { i: end } };
  }
}
