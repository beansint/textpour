# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/), versions follow [SemVer](https://semver.org/)
(pre-1.0: minor = breaking is allowed, patch = fixes/additions).

## [Unreleased]
- Concave-polygon multi-span verification: three new `node:test` specs assert that a U-shaped
  `PolygonRegion` produces rows with `spanIndex === 1` in the prong section, identical `y` across
  spans sharing a `rowIndex`, and `spanIndex === 0` only in the joined base — proving the cursor
  trick works correctly for concave polygons with disjoint intervals.
- Demo star shape: the browser demo now includes a 5-pointed star (concave polygon, 10 vertices,
  outer radius = the radius slider, inner radius = 0.42× that) as a third shape option alongside
  circle and donut. A `<select id="shape">` control switches between all three and the radius slider
  resizes every shape; `polygon()` is used for the star region and its outline is drawn via
  `ctx.moveTo`/`lineTo` over the same vertex list.
- Phase 1 work (see ROADMAP.md): justification, soft-hyphen support, auto-fit, region-from-outline.

## [0.0.1] - 2026-01-01
### Added
- Kernel scaffold: `Region` + interval algebra + Rect/Circle/Ellipse/Polygon/Composite.
- `LineSource` seam with `MonospaceLineSource` (test/demo) and `PretextLineSource` (real).
- `shapeFlow` orchestrator + `ShapeFlow.reflow` (multi-span "cursor trick" for concave shapes/holes).
- Prefix-width cursor↔point index.
- `Renderer` seam: working `Canvas2DRenderer`, stubbed `HtmlInCanvasRenderer`.
- 19 passing tests; browser demo (circle + donut + reflow).

[Unreleased]: https://github.com/beansint/textpour/compare/v0.0.1...HEAD
[0.0.1]: https://github.com/beansint/textpour/releases/tag/v0.0.1
