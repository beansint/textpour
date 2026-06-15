// Public API surface.
export type {
  Interval,
  Bounds,
  MultiSpan,
  Align,
  FlowOptions,
  PlacedLine,
  FlowResult,
  WordSegment,
} from './types.js';

export {
  // interval algebra
  normalize,
  unionSpans,
  intersectSpans,
  subtractSpans,
  // region primitives
  RectRegion,
  CircleRegion,
  EllipseRegion,
  PolygonRegion,
  CompositeRegion,
  // builders
  rect,
  circle,
  ellipse,
  polygon,
  union,
  intersect,
  subtract,
} from './region.js';
export type { Region } from './region.js';

export { MonospaceLineSource } from './line-source.js';
export type { Line, LineSource, MonoCursor } from './line-source.js';

export { PretextLineSource } from './pretext-source.js';

export {
  buildPrefixWidths,
  xToGraphemeIndex,
  graphemeIndexToX,
  canvasMeasurer,
} from './prefix-widths.js';
export type { TextMeasurer } from './prefix-widths.js';

export { shapeFlow, ShapeFlow } from './flow.js';

export { balanceWidth, balancedFlow } from './balance.js';

export { autoFit } from './auto-fit.js';
export type { AutoFitOptions, AutoFitResult } from './auto-fit.js';

export { insertSoftHyphens } from './hyphen.js';
export type { InsertSoftHyphensOptions } from './hyphen.js';

export {
  Canvas2DRenderer,
  HtmlInCanvasRenderer,
} from './renderer.js';
export type { Renderer, Canvas2DLike, HtmlInCanvasTarget } from './renderer.js';
