# textpour — design spec

## 1. Problem & thesis

[Pretext](https://github.com/chenglou/pretext) is a fast, browser-accurate text measurement & layout
library: it does line-breaking and measurement without touching the DOM (no reflow), correctly across
every script (bidi, CJK, emoji, grapheme-segmented), and exposes a cursor model
(`{segmentIndex, graphemeIndex}`) plus per-line widths.

Two valuable things sit just beyond Pretext's surface, and both need the *same* two primitives:

- **B — Shape-flow typography:** pour text into arbitrary regions (glyphs, logos, silhouettes,
  holes), which CSS never shipped (`shape-inside` is effectively dead). Needs a way to route lines
  through variable, possibly multiple, horizontal spans per row.
- **D — Canvas/WebGL text editing:** caret placement, selection rects, click-to-character in
  custom-rendered text, which every canvas/infinite-canvas app reinvents badly. Needs a map between
  pixel geometry and exact character positions.

B is *placement* (cursor + width → pixel). D is *hit-testing* (pixel → cursor). They are inverses on
one shared core:

> **The kernel** = a variable-width line router (over a `Region` and a `LineSource`) + a per-line
> cursor↔point index. Shape-flow and editing are two consumers of that kernel.

We ship **B first** (no IME/incremental-prepare tar pits, single-screenshot demo) which forces the
kernel into existence; D reuses it later.

## 2. The plan/paint split (the central architectural bet)

Pretext exists to *avoid* the browser layout engine. HTML-in-Canvas (Chrome's new `drawElementImage`
family) *embraces* it for high-fidelity, accessible paint — but its layout pass is the expensive op,
the very reflow Pretext dodges. So:

- **Plan** with Pretext every frame: pure arithmetic — does it fit, how many lines, what width
  balances, where do spans/obstacles force breaks.
- **Paint** only when the plan changes: cheap with Canvas2D; high-fidelity + accessible with
  HTML-in-Canvas where available.

The kernel therefore produces a neutral `FlowResult` (geometry + cursors) and `Renderer`s consume it.
This mirrors Pretext's own "it computes, you render" philosophy and is what lets multiple paint
backends coexist behind one API.

## 3. Data model

### Coordinate system
Top-left origin, +y down, CSS px. A text row occupies `[y, y + lineHeight)`. Spans are sampled at the
row's vertical center. Baseline (where Canvas2D `fillText` draws) = `y + ascent`. Pretext does
horizontal work only, so `ascent` and `lineHeight` are caller inputs (derive `ascent` from canvas
`measureText` metrics; see the demo).

### Region (`region.ts`)
A `Region` answers `spansAt(y): Interval[]` — the sorted, disjoint inside-intervals at scanline `y` —
plus `bounds()`. Primitives: `RectRegion`, `CircleRegion`, `EllipseRegion`, `PolygonRegion`
(even-odd scanline fill, supports concavity), and `CompositeRegion` (`union` / `intersect` /
`subtract`). Builders: `rect, circle, ellipse, polygon, union, intersect, subtract`. Backed by a
small interval-set algebra (`normalize, unionSpans, intersectSpans, subtractSpans`).

### LineSource (`line-source.ts`)
The seam decoupling the orchestrator from any text engine:
```ts
interface LineSource<C> {
  start(): C;
  nextLine(cursor: C, maxWidth: number): Line<C> | null; // null = exhausted; must make progress otherwise
}
```
`PretextLineSource` (real) wraps `prepareWithSegments` + `layoutNextLine`. `MonospaceLineSource`
(test/demo) is dependency-free and deterministic. The orchestrator only ever sees `LineSource`, which
is why it is fully unit-testable in Node without canvas or Pretext.

### shapeFlow (`flow.ts`)
The orchestrator. For each row: sample spans, then for each span feed its width to `nextLine`,
placing the returned line and advancing the cursor. With `multiSpan: 'fill'` it consumes several
spans **without advancing y** — the cursor trick that fills concave shapes and holes (a word that
would straddle a gap breaks at the gap; acceptable for shape-fill, mitigated later by hyphenation).
`ShapeFlow` holds a source so `prepare` runs once and `reflow(region)` is cheap — the reactive-region
perf story.

### prefix-widths (`prefix-widths.ts`)
Per-line cursor↔point index. `buildPrefixWidths(lineText, measurer)` returns cumulative x at each
grapheme boundary (measured as growing prefixes, so kerning is captured). `xToGraphemeIndex` (binary
search, snaps to nearer boundary) and `graphemeIndexToX` are the point↔index maps. LTR-correct today;
bidi needs Pretext `segLevels` (not in the published package yet) — see ROADMAP.

### Renderer (`renderer.ts`)
```ts
interface Renderer<Target, C> { render(result: FlowResult<C>, target: Target): void }
```
`Canvas2DRenderer` works. `HtmlInCanvasRenderer` is a documented stub (the intended `drawElementImage`
flow is in comments). Future: SVG renderer; WebGL adapter notes.

## 4. Relationship to HTML-in-Canvas (Chrome `drawElementImage`)

Status (mid-2026): origin trial, Chrome only, behind `chrome://flags/#canvas-draw-element`, no
Firefox/Safari intent. Therefore: **optional paint backend, never the foundation.** Three real
complementarities, all already accounted for by the architecture:

1. **Pretext plans, HiC paints** (see §2) — neutralizes HiC's layout-pass cost.
2. **Dual backend** — one API, swap the `Renderer`: HiC where present (free ligatures, bidi glyph
   positions, font-features, selection, IME, a11y), Canvas2D everywhere else.
3. **Shape-flow is not subsumed** — HiC only draws rectangular border boxes; it has no arbitrary
   shape flow. The flagship is *Pretext-planned shape-flow → each line painted as real styled HTML
   via HiC → mapped onto a 3D surface* (HiC's headline use cases are shaders-on-HTML and HTML on
   non-planar surfaces). Nobody has done CSS-accurate shape-flow on a 3D surface.

Honest caveats baked into the plan: HiC excludes cross-origin content, system colors, spelling
markers, and subpixel AA from the paint; you must write the returned `DOMMatrix` back to
`element.style.transform` each paint to keep hit-testing/a11y aligned; DOM changes in the `paint`
event apply next frame. None of this helps the (separate) idea of an i18n overflow linter — that
needs a real layout engine, where only Pretext avoids reflow.

## 5. API reference (current)

```ts
// regions
rect(x,y,w,h); circle(cx,cy,r); ellipse(cx,cy,rx,ry); polygon(points);
union(...r); intersect(...r); subtract(base, ...holes);
region.spansAt(y): Interval[]; region.bounds(): Bounds;

// sources
new PretextLineSource(text, font);        // browser only (needs canvas + Intl.Segmenter)
new MonospaceLineSource(text, charWidth); // tests/offline

// flow
shapeFlow(source, region, { lineHeight, ascent?, startY?, multiSpan?, align?, minSpanWidth? })
  -> { lines: PlacedLine[], overflow, endCursor, height }
new ShapeFlow(source, opts).flow(region) / .reflow(region, patch?)

// cursor<->point
buildPrefixWidths(lineText, measurer, segmenter?) -> number[]
xToGraphemeIndex(prefix, x) -> index;  graphemeIndexToX(prefix, i) -> x
canvasMeasurer(ctx, font) -> TextMeasurer

// render
new Canvas2DRenderer(font, { color? }).render(result, ctx)
HtmlInCanvasRenderer.isSupported(); // stub render() throws
```

## 6. Decisions / defaults (override-able, but these are the chosen starting points)

- TypeScript + NodeNext ESM + strict; Node 22+. (Pretext itself uses Bun; npm works fine here.)
- Span sampling at row center (simple, matches common shape-fill). A conservative "intersect over the
  whole band so text never poked outside" mode is a future option.
- `multiSpan: 'fill'` default (the cursor trick). `'widest'`/`'first'` for convex-only.
- Justification is **out** of the MVP (needs per-word x positions; `materializeLineRange`/rich-inline
  from the unreleased API, or a per-word measurement pass). `align` is left/center/right only.
- Bidi/RTL hit-testing is **out** of the MVP (needs `segLevels`). LTR is correct.
- `ascent` is a caller input; demo derives it from canvas metrics.

## 7. Non-goals (for now)

- A full font-rendering/shaping engine (Pretext's job + the browser's).
- Server-side rendering (Pretext flags it as not-shipped; would need a node canvas with fidelity
  caveats).
- The i18n overflow linter and subtitle balancer (separate Pretext projects; not this kernel).
