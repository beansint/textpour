import type { Interval, Bounds } from './types.js';

// ---------------------------------------------------------------------------
// Interval-set algebra. All public functions return sorted, disjoint intervals.
// ---------------------------------------------------------------------------

/** Sort, drop zero/negative-width, and coalesce overlapping or touching intervals. */
export function normalize(spans: Interval[]): Interval[] {
  const valid = spans.filter((s) => s[1] > s[0]);
  if (valid.length === 0) return [];
  const sorted = [...valid].sort((a, b) => a[0] - b[0]);
  const out: Interval[] = [];
  let curStart = sorted[0]![0];
  let curEnd = sorted[0]![1];
  for (let i = 1; i < sorted.length; i++) {
    const s = sorted[i]!;
    if (s[0] <= curEnd) {
      if (s[1] > curEnd) curEnd = s[1];
    } else {
      out.push([curStart, curEnd]);
      curStart = s[0];
      curEnd = s[1];
    }
  }
  out.push([curStart, curEnd]);
  return out;
}

export function unionSpans(a: Interval[], b: Interval[]): Interval[] {
  return normalize([...a, ...b]);
}

export function intersectSpans(a: Interval[], b: Interval[]): Interval[] {
  const A = normalize(a);
  const B = normalize(b);
  const out: Interval[] = [];
  let i = 0;
  let j = 0;
  while (i < A.length && j < B.length) {
    const lo = Math.max(A[i]![0], B[j]![0]);
    const hi = Math.min(A[i]![1], B[j]![1]);
    if (lo < hi) out.push([lo, hi]);
    if (A[i]![1] < B[j]![1]) i++;
    else j++;
  }
  return out;
}

export function subtractSpans(a: Interval[], b: Interval[]): Interval[] {
  const A = normalize(a);
  const B = normalize(b);
  const out: Interval[] = [];
  for (const [as, ae] of A) {
    let curStart = as;
    for (const [bs, be] of B) {
      if (be <= curStart) continue;
      if (bs >= ae) break;
      if (bs > curStart) out.push([curStart, bs]);
      curStart = Math.max(curStart, be);
      if (curStart >= ae) break;
    }
    if (curStart < ae) out.push([curStart, ae]);
  }
  return normalize(out);
}

// ---------------------------------------------------------------------------
// Region: anything that can answer "what inside-spans exist at scanline y?"
// ---------------------------------------------------------------------------

export interface Region {
  /** Sorted, disjoint inside-intervals at horizontal scanline y. Empty if y is outside. */
  spansAt(y: number): Interval[];
  bounds(): Bounds;
}

export class RectRegion implements Region {
  constructor(
    private x: number,
    private y: number,
    private w: number,
    private h: number,
  ) {}
  spansAt(y: number): Interval[] {
    if (y < this.y || y >= this.y + this.h) return [];
    return [[this.x, this.x + this.w]];
  }
  bounds(): Bounds {
    return { minX: this.x, minY: this.y, maxX: this.x + this.w, maxY: this.y + this.h };
  }
}

export class CircleRegion implements Region {
  constructor(private cx: number, private cy: number, private r: number) {}
  spansAt(y: number): Interval[] {
    const dy = y - this.cy;
    if (Math.abs(dy) >= this.r) return [];
    const hc = Math.sqrt(this.r * this.r - dy * dy);
    return [[this.cx - hc, this.cx + hc]];
  }
  bounds(): Bounds {
    return { minX: this.cx - this.r, minY: this.cy - this.r, maxX: this.cx + this.r, maxY: this.cy + this.r };
  }
}

export class EllipseRegion implements Region {
  constructor(private cx: number, private cy: number, private rx: number, private ry: number) {}
  spansAt(y: number): Interval[] {
    const dy = (y - this.cy) / this.ry;
    if (Math.abs(dy) >= 1) return [];
    const hc = this.rx * Math.sqrt(1 - dy * dy);
    return [[this.cx - hc, this.cx + hc]];
  }
  bounds(): Bounds {
    return { minX: this.cx - this.rx, minY: this.cy - this.ry, maxX: this.cx + this.rx, maxY: this.cy + this.ry };
  }
}

/** Polygon filled with the even-odd rule (supports concavity and holes via winding). */
export class PolygonRegion implements Region {
  private pts: Array<readonly [number, number]>;
  private bb: Bounds;
  constructor(points: Array<readonly [number, number]>) {
    if (points.length < 3) throw new Error('PolygonRegion needs at least 3 points');
    this.pts = points;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [px, py] of points) {
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }
    this.bb = { minX, minY, maxX, maxY };
  }
  spansAt(y: number): Interval[] {
    const xs: number[] = [];
    const pts = this.pts;
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % n]!;
      const y1 = a[1];
      const y2 = b[1];
      // Half-open crossing test avoids double-counting shared vertices.
      if ((y1 <= y && y < y2) || (y2 <= y && y < y1)) {
        const t = (y - y1) / (y2 - y1);
        xs.push(a[0] + t * (b[0] - a[0]));
      }
    }
    xs.sort((p, q) => p - q);
    const out: Interval[] = [];
    for (let i = 0; i + 1 < xs.length; i += 2) out.push([xs[i]!, xs[i + 1]!]);
    return normalize(out);
  }
  bounds(): Bounds {
    return this.bb;
  }
}

type CompositeOp = 'union' | 'intersect' | 'subtract';

/** Boolean combination of regions. 'subtract' = children[0] minus the union of the rest. */
export class CompositeRegion implements Region {
  constructor(private op: CompositeOp, private children: Region[]) {
    if (children.length === 0) throw new Error('CompositeRegion needs at least one child');
  }
  spansAt(y: number): Interval[] {
    const c = this.children;
    if (this.op === 'union') {
      return c.reduce<Interval[]>((acc, r) => unionSpans(acc, r.spansAt(y)), []);
    }
    if (this.op === 'intersect') {
      let acc = c[0]!.spansAt(y);
      for (let i = 1; i < c.length; i++) acc = intersectSpans(acc, c[i]!.spansAt(y));
      return acc;
    }
    // subtract
    let holes: Interval[] = [];
    for (let i = 1; i < c.length; i++) holes = unionSpans(holes, c[i]!.spansAt(y));
    return subtractSpans(c[0]!.spansAt(y), holes);
  }
  bounds(): Bounds {
    // Over-approximate with the union of child bounds; empty rows simply produce no spans.
    let b = this.children[0]!.bounds();
    for (let i = 1; i < this.children.length; i++) {
      const o = this.children[i]!.bounds();
      b = {
        minX: Math.min(b.minX, o.minX),
        minY: Math.min(b.minY, o.minY),
        maxX: Math.max(b.maxX, o.maxX),
        maxY: Math.max(b.maxY, o.maxY),
      };
    }
    // For subtract, the vertical/horizontal extent can only shrink, so children[0] bounds is tighter:
    return this.op === 'subtract' ? this.children[0]!.bounds() : b;
  }
}

// ---- convenience builders ----
export const rect = (x: number, y: number, w: number, h: number): Region => new RectRegion(x, y, w, h);
export const circle = (cx: number, cy: number, r: number): Region => new CircleRegion(cx, cy, r);
export const ellipse = (cx: number, cy: number, rx: number, ry: number): Region => new EllipseRegion(cx, cy, rx, ry);
export const polygon = (points: Array<readonly [number, number]>): Region => new PolygonRegion(points);
export const union = (...regions: Region[]): Region => new CompositeRegion('union', regions);
export const intersect = (...regions: Region[]): Region => new CompositeRegion('intersect', regions);
export const subtract = (base: Region, ...holes: Region[]): Region => new CompositeRegion('subtract', [base, ...holes]);
