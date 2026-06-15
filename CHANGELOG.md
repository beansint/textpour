# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/), versions follow [SemVer](https://semver.org/)
(pre-1.0: minor = breaking is allowed, patch = fixes/additions).

## [Unreleased]
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
