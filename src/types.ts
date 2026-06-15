// Core geometry & result types for the kernel.
// Coordinate model: top-left origin, +y points down, units are CSS px.
// A text row occupies the vertical band [y, y + lineHeight). Spans are sampled
// at the row's vertical center. The baseline (where Canvas2D fillText draws) is y + ascent.

/** A horizontal inside-interval [x0, x1] with x0 <= x1. */
export type Interval = readonly [number, number];

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** How to use multiple disjoint spans on a single row. */
export type MultiSpan =
  | 'fill'    // pour text through every span on the row (the cursor trick) — fills concave shapes / holes
  | 'widest'  // use only the widest span on the row (simple, convex-ish)
  | 'first';  // use only the first (leftmost) span

export type Align = 'left' | 'center' | 'right';

export interface FlowOptions {
  /** CSS line-height in px. Required. */
  lineHeight: number;
  /** Baseline offset within the row box (px). Default: lineHeight * 0.8. */
  ascent?: number;
  /** First row's top y. Default: region.bounds().minY. */
  startY?: number;
  /** Multi-span strategy. Default: 'fill'. */
  multiSpan?: MultiSpan;
  /** Horizontal alignment within each span. Default: 'left'. */
  align?: Align;
  /** Ignore spans narrower than this (px). Default: 1. */
  minSpanWidth?: number;
}

/** One laid-out line, positioned. Carries source cursors for hit-testing / continuation. */
export interface PlacedLine<C> {
  text: string;
  /** Left x of the line after alignment. */
  x: number;
  /** Top y of the row box. */
  y: number;
  /** y + ascent — pass this to Canvas2D fillText with textBaseline 'alphabetic'. */
  baseline: number;
  /** Measured width of the line. */
  width: number;
  /** Row index from startY (0-based; rows with no content still increment it). */
  rowIndex: number;
  /** Which span within the row this line filled (0 for single-span rows). */
  spanIndex: number;
  /** Inclusive start cursor in the source. */
  start: C;
  /** Exclusive end cursor in the source. */
  end: C;
}

export interface FlowResult<C> {
  lines: PlacedLine<C>[];
  /** True if text remained when vertical room ran out. */
  overflow: boolean;
  /** Where layout stopped — the start of any leftover text (drive pagination / auto-fit with this). */
  endCursor: C;
  /** Vertical extent actually used: bottom of last content row minus startY. */
  height: number;
}
