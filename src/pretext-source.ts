// The real adapter onto @chenglou/pretext. Kept in a separate module so that
// importing the orchestrator/tests does NOT pull Pretext (which needs Canvas 2D + Intl.Segmenter
// at runtime). Only browser code / the demo imports this.
//
// VERSION NOTE: built against the published @chenglou/pretext@0.0.1, which exposes
//   prepareWithSegments(text, font)            // no options arg yet
//   layoutNextLine(prepared, cursor, maxWidth) // returns a materialized LayoutLine | null
// The GitHub README is ahead of npm and adds layoutNextLineRange/materializeLineRange/
// measureLineStats/measureNaturalWidth/rich-inline + a prepare options arg. When those ship,
// switch nextLine() to the range API to avoid materializing text on rows you only measure.

import {
  prepareWithSegments,
  layoutNextLine,
  type LayoutCursor,
  type PreparedTextWithSegments,
} from '@chenglou/pretext';
import type { Line, LineSource } from './line-source.js';
import type { TextMeasurer } from './prefix-widths.js';

export class PretextLineSource implements LineSource<LayoutCursor> {
  private prepared: PreparedTextWithSegments;
  /**
   * @param text the paragraph to lay out
   * @param font a Canvas 2D font shorthand, e.g. '16px Inter'. Must match the CSS used to render.
   * @param measurer optional — when provided, `nextLine` populates `Line.words` for justification.
   *   Pass `canvasMeasurer(ctx, font)` from `prefix-widths.ts`. Without a measurer, `words` is
   *   undefined and `align:'justify'` silently falls back to left alignment.
   *
   * Soft hyphens (U+00AD) are honored natively by Pretext: unchosen soft hyphens are invisible,
   * and when a soft hyphen wins the break, Pretext's materialized `line.text` already ends with a
   * visible '-'. The @chenglou/pretext@0.0.1 API exposes no flag to distinguish a soft-hyphen break
   * from a real hyphen, so `softHyphenated` is left undefined here (a real '-' is indistinguishable
   * from a soft-hyphen break via the 0.0.1 API). To pre-insert soft hyphens into your text before
   * constructing this source, use the `insertSoftHyphens()` helper exported from this package.
   */
  constructor(text: string, font: string, private measurer?: TextMeasurer) {
    this.prepared = prepareWithSegments(text, font);
  }
  start(): LayoutCursor {
    return { segmentIndex: 0, graphemeIndex: 0 };
  }
  nextLine(cursor: LayoutCursor, maxWidth: number): Line<LayoutCursor> | null {
    const line = layoutNextLine(this.prepared, cursor, maxWidth);
    if (line === null) return null;
    // softHyphenated is left undefined: the 0.0.1 API provides no way to detect a soft-hyphen break.
    if (this.measurer === undefined) {
      return { text: line.text, width: line.width, start: line.start, end: line.end };
    }
    // Build per-word segments for justification support.
    // x is the natural offset of each word from the LINE LEFT (cumulative widths + space widths).
    // flow.ts recomputes absolute x when justify is active, so approximate space measure is fine.
    const measurer = this.measurer;
    const spaceWidth = measurer.measure(' ');
    const tokens = line.text.split(' ').filter(t => t.length > 0);
    // Reconstruct natural x offsets by walking the tokens left-to-right.
    let xOff = 0;
    let tokenIdx = 0;
    const wordSegments = tokens.map(token => {
      // Find where this token starts in the displayed text (skip leading spaces/prior tokens).
      const tokenX = xOff;
      const w = measurer.measure(token);
      xOff += w;
      // Account for one space gap between tokens (approximate — ignores multiple consecutive spaces).
      if (tokenIdx < tokens.length - 1) xOff += spaceWidth;
      tokenIdx++;
      return { text: token, x: tokenX, width: w };
    });
    return { text: line.text, width: line.width, start: line.start, end: line.end, words: wordSegments };
  }
}
