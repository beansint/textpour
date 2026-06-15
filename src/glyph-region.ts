/**
 * Glyph-outline region — the opentype.js seam.
 *
 * This module keeps `opentype.js` (and any font-loading library) entirely out of the
 * `textpour` package. The caller is responsible for loading a font and converting a
 * glyph to SVG path data; this module then wraps the path into a geometry `Region`.
 *
 * Typical caller-side usage with opentype.js:
 * ```ts
 * import opentype from 'opentype.js';
 * import { glyphToRegion } from 'textpour';
 *
 * const font = await opentype.load('MyFont.otf');
 * const glyph = font.charToGlyph('A');
 * const pathData = glyph.getPath(x, y, fontSize).toPathData();
 * const region = glyphToRegion(pathData);
 * ```
 *
 * Note: opentype.js renders glyph paths with Y-axis flipped relative to CSS (glyph
 * coordinates increase upward). Callers should pass a negative `y` origin or apply a
 * scaling transform via `getPath(x, y, fontSize)` to position the glyph in CSS px
 * coordinates before calling `toPathData()`.
 */

import type { Region } from './region.js';
import { svgPathToRegion } from './outline-region.js';

/**
 * An array of [x, y] points representing one contour of a glyph.
 * Exported as a convenience type for callers who pre-process glyph outlines before
 * passing path data to `glyphToRegion`.
 */
export type GlyphContour = Array<[number, number]>;

/**
 * Convert SVG path data from a glyph outline into a `Region`.
 *
 * Pass `glyph.getPath(x, y, fontSize).toPathData()` from opentype.js here.
 * The kernel remains dependency-free — opentype.js stays on the caller's side.
 *
 * @param pathData SVG path `d` attribute string (M/L/C/Q/Z commands).
 * @param opts     Optional flattening options (default `steps` = 24 per curve segment).
 */
export function glyphToRegion(pathData: string, opts?: { steps?: number }): Region {
  return svgPathToRegion(pathData, opts);
}
