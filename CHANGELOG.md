# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/), versions follow [SemVer](https://semver.org/)
(pre-1.0: minor = breaking is allowed, patch = fixes/additions).

## [Unreleased]

## [0.1.1] - 2026-06-16
### Docs / infra
- README: new "Why not just Pretext?" section explaining the geometry layer textpour adds on top of
  Pretext (regions/holes/outlines/masks, multi-span rows, auto-fit, plan/paint kernel).
- CI: automated npm publish on GitHub Release is now wired (`NPM_TOKEN` secret + `publish.yml`); this
  is the first release published through that pipeline.

## [0.1.0] - 2026-06-16
### Phase 1 — Shape-flow quality
- Conservative band sampling (Phase 1, item 7): new `FlowOptions.conservativeBandSampling` (with
  `bandSamplingSteps`, default 3). When enabled, each row's spans are the intersection of
  `region.spansAt` taken at several y within `[y, y+lineHeight)` instead of the single row center, so
  text never pokes outside a tight curve — at the cost of extra `spansAt` calls per row.
- Auto-fit (Phase 1, item 5): new `autoFit<C>(makeSource, region, opts): AutoFitResult<C>` function
  binary-searches the largest font size in `[minSizePx, maxSizePx]` (defaults 6–96) at which
  `shapeFlow` does not overflow the region. Convergence stops when `hi − lo < tolerance` (default
  0.5 px) or `maxIterations` (default 24) is reached; in practice fewer than 10 iterations suffice.
  `AutoFitOptions` extends `FlowOptions` with `minSizePx`, `maxSizePx`, `tolerance`,
  `maxIterations`, `lineHeightRatio`, and `ascentRatio`; the ratio fields scale `lineHeight`/`ascent`
  proportionally with the trial size so the overflow predicate stays monotonic in size (larger font →
  taller rows → fewer rows fit → overflow). When `maxSizePx` fits the region it is returned directly;
  when even `minSizePx` overflows it is returned as a best-effort result with `overflow===true`.
  **Per-size Pretext cost:** each trial calls `makeSource(sizePx)`, which under `PretextLineSource`
  triggers a full `prepareWithSegments` call (O(text) Unicode segmentation). Keep `maxIterations`
  low and cache results when text/region are stable; a future stats-API seam
  (`measureLineStats`/`layoutNextLineRange`) can shortcut the full shapeFlow pass without changing
  this module's interface. `autoFit`, `AutoFitOptions`, and `AutoFitResult` are exported from the
  barrel. Six new `node:test` specs cover: main convergence check (largest fitting + smallest
  overflowing), very-large-region fast-path (returns `maxSizePx`), tiny-region best-effort
  (returns `minSizePx` with `overflow===true`), custom bounds, `maxIterations=1` safety cap, and
  explicit `ascentRatio` baseline correctness.
- Balanced lines (Phase 1, item 4): new `balanceWidth(source, region, options): number` binary-searches
  the minimum line width (in ~20 iterations, resolution 0.5 px) that preserves the unconstrained line
  count and overflow flag, so the ragged edge is more even (avoids a near-empty last line). New
  `balancedFlow(source, region, options): FlowResult<C>` is the convenience combinator that flows
  through the capped region in one call. `ShapeFlow` gains a `rebalance(region, optionsPatch?)` method
  that delegates to `balancedFlow`. Both are exported from the barrel. **Caveat:** uniform width
  narrowing is most effective for rectangular / near-rectangular regions; for highly variable-width
  shapes (circles, stars, concave polygons) it is a hint rather than a guarantee, and is best paired
  with `multiSpan: 'widest'` or `'first'`. Internal `NarrowedRegion` is not exported. Six new
  `node:test` specs cover the primary use-case, single-line no-op, overflow preservation, and
  consistency between `balanceWidth` and `balancedFlow`.
- Justification (Phase 1, item 3): `Align` now includes `'justify'`; new `WordSegment` interface
  exported from the barrel. `Line<C>` gains optional `words?: WordSegment[]` (x relative to line
  left, width excluding spaces). `MonospaceLineSource` populates `words` on every non-empty line.
  `shapeFlow` detects last-line via a pure lookahead `nextLine` probe and, for non-last lines with
  > 1 word and `align==='justify'`, computes absolute `PlacedLine.words` with gap-expanded x
  positions so the last word's right edge exactly meets the span's right edge. `Canvas2DRenderer`
  draws each word individually when `PlacedLine.words` is present. `PretextLineSource` accepts an
  optional `TextMeasurer` ctor arg and populates `words` when present (justify silently falls back
  to left without it). Demo adds a "justify" checkbox. Three new `node:test` specs cover span-fill,
  ragged last line, and no single-word stretch.
- Soft-hyphen support (Phase 1, item 2): `MonospaceLineSource` now honors U+00AD as an optional
  break point matching Pretext's semantics — unchosen soft hyphens are invisible (zero width),
  and when a soft hyphen wins the break the displayed text gains a trailing `-` with
  `softHyphenated: true`. `PlacedLine<C>` and `Line<C>` carry the new optional `softHyphenated`
  flag (propagated through `shapeFlow`). New `insertSoftHyphens()` helper applies a conservative
  vowel→consonant heuristic to long Latin words (≥8 chars by default). `PretextLineSource`
  documents that Pretext honors soft hyphens natively and `softHyphenated` is left undefined
  pending a 0.0.1 API to detect soft-hyphen breaks.
- Concave-polygon multi-span verification: three new `node:test` specs assert that a U-shaped
  `PolygonRegion` produces rows with `spanIndex === 1` in the prong section, identical `y` across
  spans sharing a `rowIndex`, and `spanIndex === 0` only in the joined base — proving the cursor
  trick works correctly for concave polygons with disjoint intervals.
- Demo star shape: the browser demo now includes a 5-pointed star (concave polygon, 10 vertices,
  outer radius = the radius slider, inner radius = 0.42× that) as a third shape option alongside
  circle and donut. A `<select id="shape">` control switches between all three and the radius slider
  resizes every shape; `polygon()` is used for the star region and its outline is drawn via
  `ctx.moveTo`/`lineTo` over the same vertex list.
- Region from outline (Phase 1, item 6): new `svgPathToPolygon(d, opts?)` flattens an SVG path
  string (M/m L/l H/h V/v C/c Q/q Z/z, absolute + relative) into a `[x,y][]` point array by
  tessellating cubic and quadratic Béziers with de Casteljau at `opts.steps` subdivisions (default
  24). `svgPathToRegion(d, opts?)` is the convenience wrapper that passes the flattened polygon to
  the existing `polygon()` builder. `maskRegion(width, height, alpha, threshold?, originX?, originY?)`
  builds a `Region` from a row-major alpha array (e.g. `ImageData.data` every 4th byte) using
  run-length scanning per row; threshold defaults to 128, origins to 0. A thin `glyph-region.ts`
  module exports `glyphToRegion(pathData, opts?)`, documented as "pass
  `glyph.getPath(x,y,fontSize).toPathData()` from opentype.js"; opentype.js is NOT a dependency of
  this package — it stays entirely caller-side. `GlyphContour` type alias is also exported. Browser
  demo gains a "heart" shape option built from `svgPathToRegion` (M/C/Z path, no radius slider
  dependency). Seven new `node:test` specs cover the triangle corners, triangle flow containment,
  cubic flattening point count, relative command absolutization, maskRegion run-length result,
  maskRegion origin offset, and glyphToRegion bounds/spans sanity.

## [0.0.1] - 2026-01-01
### Added
- Kernel scaffold: `Region` + interval algebra + Rect/Circle/Ellipse/Polygon/Composite.
- `LineSource` seam with `MonospaceLineSource` (test/demo) and `PretextLineSource` (real).
- `shapeFlow` orchestrator + `ShapeFlow.reflow` (multi-span "cursor trick" for concave shapes/holes).
- Prefix-width cursor↔point index.
- `Renderer` seam: working `Canvas2DRenderer`, stubbed `HtmlInCanvasRenderer`.
- 19 passing tests; browser demo (circle + donut + reflow).

[Unreleased]: https://github.com/beansint/textpour/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/beansint/textpour/releases/tag/v0.1.1
[0.1.0]: https://github.com/beansint/textpour/releases/tag/v0.1.0
[0.0.1]: https://github.com/beansint/textpour/releases/tag/v0.0.1
