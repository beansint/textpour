# CLAUDE.md

Operational guide for working on this repo. Read `SPEC.md` for the design and `ROADMAP.md` for the
task sequence. Start at the first unchecked item in `ROADMAP.md`.

## What this is

`textpour` is a render-agnostic **text-geometry kernel** built on
[`@chenglou/pretext`](https://github.com/chenglou/pretext). It does two things Pretext alone does not:

1. **Shape-flow (project B):** pours text into arbitrary 2D regions (circles, polygons, holes,
   boolean combinations) by routing Pretext's line-breaking through per-row spans.
2. **Cursor ↔ point mapping (foundation for project D):** maps pixel positions to exact character
   positions and back, for hit-testing/caret work in custom-rendered text.

The kernel **computes geometry only**; pluggable `Renderer`s paint it (Canvas2D today, HTML-in-Canvas
stubbed for later). The core design bet is the **plan/paint split**: Pretext plans cheaply every
frame, an expensive high-fidelity backend paints only when the plan changes.

## Stack & commands

- TypeScript, NodeNext ESM, strict. Node 22+.
- `npm install` — deps are `@chenglou/pretext`; dev `typescript`, `@types/node`.
- `npm run typecheck` — `tsc --noEmit`.
- `npm test` — compiles then runs `node --test` over `dist/test/*.test.js`.
- `npm run build` — emits `dist/`.
- Demo: `npm run build`, then serve the folder over http and open `/demo/index.html`
  (ES modules + Pretext require http, not `file://`).

## File map

```
src/
  types.ts         Interval, FlowOptions, PlacedLine, FlowResult. Coordinate model lives here.
  region.ts        Region interface + interval algebra + Rect/Circle/Ellipse/Polygon/Composite + builders.
  line-source.ts   LineSource<C> seam + MonospaceLineSource (test/demo; no Pretext, no canvas).
  pretext-source.ts PretextLineSource — the real prepareWithSegments + layoutNextLine wiring.
  prefix-widths.ts cursor<->point index for a single line (caret/hit-test/justification).
  flow.ts          shapeFlow() orchestrator + ShapeFlow class (reflow reuses the prepared pass).
  renderer.ts      Renderer<Target> + Canvas2DRenderer (works) + HtmlInCanvasRenderer (stub).
  pretext.d.ts     Pinned type subset of @chenglou/pretext (mapped via tsconfig "paths").
  index.ts         Public barrel.
test/              node:test specs for region, flow, prefix-widths (all pure — no canvas needed).
demo/index.html    Browser demo: real Pretext + Canvas2DRenderer, circle + donut + reflow slider.
```

## Conventions (do not drift from these)

- **NodeNext imports**: relative imports MUST end in `.js` (e.g. `import { x } from './region.js'`).
- **Dependency inversion is the architecture, not decoration.** The orchestrator depends only on the
  `LineSource` and `Region` interfaces, never on Pretext or canvas directly. This is why the whole
  core is unit-testable in Node with `MonospaceLineSource`. Keep it that way: new engine = new
  `LineSource`; new paint target = new `Renderer`.
- **Keep Pretext out of the test path.** `pretext-source.ts` is the only module that imports
  `@chenglou/pretext`. Tests must not import it (Pretext needs Canvas 2D + `Intl.Segmenter` at
  runtime). `flow.ts` imports `LineSource` as a *type only*.
- **Coordinate model**: top-left origin, +y down, CSS px. A row occupies `[y, y+lineHeight)`; spans
  are sampled at the row center; baseline = `y + ascent`. Pretext is horizontal-only, so `ascent`
  and `lineHeight` are caller inputs.
- **strict + noUncheckedIndexedAccess** are on. Index access needs guards or `!`.

## Pretext version note (important)

Built against published `@chenglou/pretext@0.0.1`, which lags the GitHub README. Installed API:
`prepareWithSegments(text, font)` (no options arg) and `layoutNextLine(prepared, cursor, maxWidth)`
returning a materialized line. The README adds `layoutNextLineRange` / `materializeLineRange` /
`measureLineStats` / `measureNaturalWidth` / rich-inline + a `prepare` options arg. When those ship,
extend `src/pretext.d.ts` and switch `nextLine()` to the range API (avoids materializing text on
rows you only measure — matters for the speculative width search in justification).

## Guardrails

- **Do not build the HTML-in-Canvas backend first.** It is a Chrome-only origin-trial flag and will
  move under you. It is the flourish, not the foundation. Canvas2D is the baseline.
- **Quality is the moat.** Ragged single-span shape-fill is a toy. The value is concave multi-span,
  justification, balanced lines, and hyphenation. Don't ship the toy and call it done.
- **Don't depend on this for money/adoption assumptions.** This is a novel capability + reusable
  kernel, not infrastructure everyone installs. (See ROADMAP "kill criteria".)
- Keep `index.ts` as the single public surface; keep internals importable for tests.
