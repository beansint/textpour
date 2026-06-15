import type { FlowResult } from './types.js';

/** A paint backend. The kernel produces geometry; renderers turn it into pixels/DOM. */
export interface Renderer<Target, C = unknown> {
  render(result: FlowResult<C>, target: Target): void;
}

/** Minimal slice of CanvasRenderingContext2D we actually use (keeps it testable). */
export interface Canvas2DLike {
  font: string;
  fillStyle: string | CanvasGradient | CanvasPattern;
  textBaseline: CanvasTextBaseline;
  fillText(text: string, x: number, y: number): void;
}

/** Working backend: draws each placed line to a 2D canvas. */
export class Canvas2DRenderer<C = unknown> implements Renderer<Canvas2DLike, C> {
  constructor(private font: string, private opts: { color?: string } = {}) {}
  render(result: FlowResult<C>, ctx: Canvas2DLike): void {
    ctx.font = this.font;
    ctx.textBaseline = 'alphabetic';
    if (this.opts.color) ctx.fillStyle = this.opts.color;
    for (const line of result.lines) ctx.fillText(line.text, line.x, line.baseline);
  }
}

/**
 * STUB. HTML-in-Canvas is a Chrome origin-trial API (chrome://flags/#canvas-draw-element); no
 * Firefox/Safari intent yet. The seam exists so the shape-flow module can target a high-fidelity,
 * accessible paint path without knowing the backend. Pretext still does ALL line-breaking/geometry
 * (the plan); HTML-in-Canvas only does the paint.
 *
 * Intended implementation (see ROADMAP phase 2):
 *   1. Give the <canvas> the `layoutsubtree` attribute.
 *   2. Keep one real styled child element per PlacedLine (e.g. a <span> with the same CSS font),
 *      as a direct child of the canvas, positioned via CSS transform to (line.x, line.baseline).
 *   3. In the canvas `paint` event, for each line call
 *        const m = ctx.drawElementImage(span, line.x, line.y);
 *        span.style.transform = m.toString();   // keep hit-testing + a11y aligned
 *   4. Repaint only when the FlowResult changes; use canvas.requestPaint() for per-frame needs.
 *      Caching matters: the element layout pass is the expensive op (the very reflow Pretext avoids),
 *      so plan with Pretext every frame and only drawElementImage when the chosen layout changes.
 */
export interface HtmlInCanvasTarget {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

export class HtmlInCanvasRenderer<C = unknown> implements Renderer<HtmlInCanvasTarget, C> {
  /** Feature-detect the origin-trial API before using this backend. */
  static isSupported(): boolean {
    return (
      typeof CanvasRenderingContext2D !== 'undefined' &&
      'drawElementImage' in CanvasRenderingContext2D.prototype
    );
  }
  render(_result: FlowResult<C>, _target: HtmlInCanvasTarget): void {
    throw new Error(
      'HtmlInCanvasRenderer is a stub (ROADMAP phase 2). HTML-in-Canvas is a Chrome origin-trial ' +
        'API behind chrome://flags/#canvas-draw-element. See renderer.ts comments for the intended ' +
        'drawElementImage flow. Use Canvas2DRenderer until this is implemented.',
    );
  }
}
