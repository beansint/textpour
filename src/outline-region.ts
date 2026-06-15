import type { Bounds } from './types.js';
import type { Region } from './region.js';
import { polygon } from './region.js';
import type { Interval } from './types.js';

// ---------------------------------------------------------------------------
// SVG path tokenizer
// ---------------------------------------------------------------------------

/**
 * Tokenize an SVG `d` attribute string into commands and numeric arguments.
 * Handles: M/m L/l H/h V/v C/c Q/q Z/z (absolute + relative variants).
 * Numbers may be delimited by whitespace, commas, or sign characters.
 */
function* tokenizePath(d: string): Generator<string | number> {
  const re = /([MmLlHhVvCcQqZz])|([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d)) !== null) {
    if (m[1] !== undefined) {
      yield m[1];
    } else if (m[2] !== undefined) {
      yield parseFloat(m[2]);
    }
  }
}

// ---------------------------------------------------------------------------
// De Casteljau flattening helpers
// ---------------------------------------------------------------------------

/** Evaluate a cubic Bézier at parameter t. */
function cubicBezier(
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  t: number,
): [number, number] {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  return [
    mt2 * mt * p0[0] + 3 * mt2 * t * p1[0] + 3 * mt * t2 * p2[0] + t2 * t * p3[0],
    mt2 * mt * p0[1] + 3 * mt2 * t * p1[1] + 3 * mt * t2 * p2[1] + t2 * t * p3[1],
  ];
}

/** Evaluate a quadratic Bézier at parameter t. */
function quadBezier(
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  t: number,
): [number, number] {
  const mt = 1 - t;
  return [
    mt * mt * p0[0] + 2 * mt * t * p1[0] + t * t * p2[0],
    mt * mt * p0[1] + 2 * mt * t * p1[1] + t * t * p2[1],
  ];
}

// ---------------------------------------------------------------------------
// SVG path flattener
// ---------------------------------------------------------------------------

/**
 * Parse a minimal subset of SVG path data into a flat array of [x, y] points.
 *
 * Supported commands: M/m, L/l, H/h, V/v, C/c, Q/q, Z/z (absolute + relative).
 * Cubic (C) and quadratic (Q) Béziers are flattened with `opts.steps` subdivisions
 * per segment (default 24).
 *
 * Multiple subpaths are concatenated (acceptable for even-odd polygon fill).
 */
export function svgPathToPolygon(
  d: string,
  opts?: { steps?: number },
): Array<[number, number]> {
  const steps = opts?.steps ?? 24;
  const pts: Array<[number, number]> = [];
  const tokens = [...tokenizePath(d)];
  let i = 0;

  let cx = 0; // current x
  let cy = 0; // current y
  let subpathStartX = 0;
  let subpathStartY = 0;
  let cmd = '';

  function nextNum(): number {
    while (i < tokens.length && typeof tokens[i] === 'string') i++;
    if (i >= tokens.length) throw new Error('SVG path: expected number');
    return tokens[i++] as number;
  }

  function addPoint(x: number, y: number): void {
    pts.push([x, y]);
  }

  while (i < tokens.length) {
    const tok = tokens[i];
    if (typeof tok === 'string') {
      cmd = tok;
      i++;
    }
    // Implicit line-to: after M, subsequent coords are L; after m, they are l.
    const impliedCmd = cmd === 'M' ? 'L' : cmd === 'm' ? 'l' : cmd;

    switch (cmd) {
      case 'M':
      case 'm': {
        const x = nextNum();
        const y = nextNum();
        if (cmd === 'M') {
          cx = x; cy = y;
        } else {
          cx += x; cy += y;
        }
        subpathStartX = cx;
        subpathStartY = cy;
        addPoint(cx, cy);
        // Switch to implied L/l for subsequent coordinate pairs.
        cmd = cmd === 'M' ? 'L' : 'l';
        break;
      }
      case 'L':
      case 'l': {
        const x = nextNum();
        const y = nextNum();
        if (impliedCmd === 'L') {
          cx = x; cy = y;
        } else {
          cx += x; cy += y;
        }
        addPoint(cx, cy);
        break;
      }
      case 'H':
      case 'h': {
        const x = nextNum();
        cx = cmd === 'H' ? x : cx + x;
        addPoint(cx, cy);
        break;
      }
      case 'V':
      case 'v': {
        const y = nextNum();
        cy = cmd === 'V' ? y : cy + y;
        addPoint(cx, cy);
        break;
      }
      case 'C':
      case 'c': {
        const x1 = nextNum(); const y1 = nextNum();
        const x2 = nextNum(); const y2 = nextNum();
        const x  = nextNum(); const y  = nextNum();
        const p0: [number, number] = [cx, cy];
        const p1: [number, number] = cmd === 'C' ? [x1, y1] : [cx + x1, cy + y1];
        const p2: [number, number] = cmd === 'C' ? [x2, y2] : [cx + x2, cy + y2];
        const p3: [number, number] = cmd === 'C' ? [x, y]   : [cx + x,  cy + y];
        for (let s = 1; s <= steps; s++) {
          addPoint(...cubicBezier(p0, p1, p2, p3, s / steps));
        }
        cx = p3[0]; cy = p3[1];
        break;
      }
      case 'Q':
      case 'q': {
        const x1 = nextNum(); const y1 = nextNum();
        const x  = nextNum(); const y  = nextNum();
        const p0: [number, number] = [cx, cy];
        const p1: [number, number] = cmd === 'Q' ? [x1, y1] : [cx + x1, cy + y1];
        const p2: [number, number] = cmd === 'Q' ? [x, y]   : [cx + x,  cy + y];
        for (let s = 1; s <= steps; s++) {
          addPoint(...quadBezier(p0, p1, p2, s / steps));
        }
        cx = p2[0]; cy = p2[1];
        break;
      }
      case 'Z':
      case 'z': {
        // Close path: line back to subpath start (add the close point so the polygon closes).
        addPoint(subpathStartX, subpathStartY);
        cx = subpathStartX;
        cy = subpathStartY;
        // Reset cmd so the next token is always read as a command.
        cmd = '';
        break;
      }
      default:
        // Unknown command — skip to next command token.
        i++;
    }
  }

  return pts;
}

/**
 * Convenience: parse an SVG path string into a `Region` (via `PolygonRegion`, even-odd fill).
 */
export function svgPathToRegion(d: string, opts?: { steps?: number }): Region {
  return polygon(svgPathToPolygon(d, opts));
}

// ---------------------------------------------------------------------------
// Alpha-mask region
// ---------------------------------------------------------------------------

class MaskRegion implements Region {
  private readonly threshold: number;
  private readonly originX: number;
  private readonly originY: number;
  private readonly bb: Bounds;

  constructor(
    private readonly width: number,
    private readonly height: number,
    private readonly alpha: Uint8ClampedArray | number[],
    threshold?: number,
    originX?: number,
    originY?: number,
  ) {
    this.threshold = threshold ?? 128;
    this.originX = originX ?? 0;
    this.originY = originY ?? 0;
    this.bb = {
      minX: this.originX,
      minY: this.originY,
      maxX: this.originX + width,
      maxY: this.originY + height,
    };
  }

  spansAt(y: number): Interval[] {
    const row = Math.floor(y - this.originY);
    if (row < 0 || row >= this.height) return [];
    const out: Interval[] = [];
    let inRun = false;
    let runStart = 0;
    const { width, alpha, threshold, originX } = this;
    for (let col = 0; col < width; col++) {
      const inside = (alpha[row * width + col] ?? 0) >= threshold;
      if (inside && !inRun) {
        inRun = true;
        runStart = col;
      } else if (!inside && inRun) {
        out.push([originX + runStart, originX + col]);
        inRun = false;
      }
    }
    if (inRun) {
      out.push([originX + runStart, originX + width]);
    }
    return out;
  }

  bounds(): Bounds {
    return this.bb;
  }
}

/**
 * Build a `Region` from a raster alpha mask.
 *
 * @param width     Pixel width of the mask grid.
 * @param height    Pixel height of the mask grid.
 * @param alpha     Row-major array of alpha values (`alpha[row * width + col]`).
 * @param threshold Minimum alpha to count as "inside" (default 128, half-transparent).
 * @param originX   X offset of the mask's top-left corner in canvas space (default 0).
 * @param originY   Y offset of the mask's top-left corner in canvas space (default 0).
 */
export function maskRegion(
  width: number,
  height: number,
  alpha: Uint8ClampedArray | number[],
  threshold?: number,
  originX?: number,
  originY?: number,
): Region {
  return new MaskRegion(width, height, alpha, threshold, originX, originY);
}
