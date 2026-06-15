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

export class PretextLineSource implements LineSource<LayoutCursor> {
  private prepared: PreparedTextWithSegments;
  /**
   * @param text the paragraph to lay out
   * @param font a Canvas 2D font shorthand, e.g. '16px Inter'. Must match the CSS used to render.
   *
   * Soft hyphens (U+00AD) are honored natively by Pretext: unchosen soft hyphens are invisible,
   * and when a soft hyphen wins the break, Pretext's materialized `line.text` already ends with a
   * visible '-'. The @chenglou/pretext@0.0.1 API exposes no flag to distinguish a soft-hyphen break
   * from a real hyphen, so `softHyphenated` is left undefined here (a real '-' is indistinguishable
   * from a soft-hyphen break via the 0.0.1 API). To pre-insert soft hyphens into your text before
   * constructing this source, use the `insertSoftHyphens()` helper exported from this package.
   */
  constructor(text: string, font: string) {
    this.prepared = prepareWithSegments(text, font);
  }
  start(): LayoutCursor {
    return { segmentIndex: 0, graphemeIndex: 0 };
  }
  nextLine(cursor: LayoutCursor, maxWidth: number): Line<LayoutCursor> | null {
    const line = layoutNextLine(this.prepared, cursor, maxWidth);
    if (line === null) return null;
    // softHyphenated is left undefined: the 0.0.1 API provides no way to detect a soft-hyphen break.
    return { text: line.text, width: line.width, start: line.start, end: line.end };
  }
}
