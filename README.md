# textpour

A render-agnostic **text-geometry kernel** on top of
[`@chenglou/pretext`](https://github.com/chenglou/pretext).

- **Shape-flow**: pour text into arbitrary 2D regions — circles, polygons, holes, boolean
  combinations, SVG paths, glyph outlines, and raster alpha masks — by routing Pretext's
  line-breaking through per-row spans. (CSS `shape-inside` never shipped; this does it.)
- **Typographic quality** (the moat): justification (`align: 'justify'`), soft-hyphenation,
  balanced lines, auto-fit (binary-search font size), and conservative band sampling so glyphs
  never poke outside tight curves.
- **Cursor ↔ point mapping**: map pixel positions to exact grapheme positions and back, for
  caret/hit-testing in custom-rendered text.
- **Pluggable paint**: the kernel computes geometry; `Renderer`s paint it. Canvas2D works today;
  an HTML-in-Canvas adapter (for high-fidelity, accessible, 3D-surface paint) is stubbed for later.

The design bet is the **plan/paint split**: Pretext plans cheaply every frame (no DOM reflow); an
expensive high-fidelity backend paints only when the plan changes.

## Demo

Text poured into a circle and a donut (multi-span), reflowing live as the region changes — the same
prepared pass reused on every frame:

![textpour demo: text flowing into a circle and a donut, reflowing live](assets/textpour-demo.gif)

## Why not just Pretext?

Pretext is the line-breaking and measurement engine — a very good one. It breaks lines at a width
*you give it*, measures without DOM reflow, and its fuller API even does Knuth–Plass justification,
syllable hyphenation, and "shrinkwrap" (`walkLineRanges`). It can already flow text past a floated
image, because that's still **one rectangular width that varies by `y`**.

What Pretext deliberately does **not** model is **2D geometry**. Its layout call is "one line, one
width." textpour adds exactly that missing layer:

- **Arbitrary regions, not a scalar width.** A `Region` turns any 2D shape — circles, ellipses,
  polygons, boolean unions/intersections/**holes**, SVG paths, glyph outlines, raster alpha masks —
  into the per-row spans Pretext consumes. Pretext has no notion of a shape, a hole, or an outline.
- **Multiple disjoint spans per line — the "cursor trick."** Pouring a single row across the left
  *and* right of a hole (a donut), or into the prongs of a concave shape, in reading order on one
  baseline. Pretext's one-line-one-width API can't natively continue a row across a gap; textpour
  threads one cursor through every span on the row.
- **Auto-fit to a region** — binary-search the font size that exactly fills a shape. Pretext keys
  layout on `(text, font)`; it doesn't size-to-fit a 2D area.
- **A render-agnostic plan/paint kernel** — geometry computed once, painted by pluggable
  `Renderer`s (Canvas2D today, HTML-in-Canvas later).
- **Cursor ↔ point mapping** for hit-testing/caret in custom-rendered text.

Honest overlap: textpour targets the **published `@chenglou/pretext@0.0.1`**, whose API is just
`prepareWithSegments` + `layoutNextLine`. So textpour's own justification, soft-hyphenation, and
balanced-lines are pragmatic implementations over that minimal surface — when Pretext ships its
richer API (Knuth–Plass justify, real hyphenation, `walkLineRanges`), textpour will defer to those
and keep only the geometry it uniquely contributes.

In one line: **Pretext breaks the lines; textpour decides the shape those lines fill.**

## Quickstart

```bash
npm install
npm test          # builds, runs the pure-logic test suite (56 specs)
npm run build     # emits dist/
# demo (needs a browser + http):
npx http-server . # or any static server
# open /demo/index.html
```

## Status

**Phase 0** (kernel scaffold) and **Phase 1** (shape-flow quality — justification, soft-hyphenation,
balanced lines, auto-fit, region-from-outline, conservative band sampling) are complete and tested
(56 specs). See **ROADMAP.md** for what's next — the HTML-in-Canvas renderer (Phase 2), then the
flagship "shaped CSS text on a 3D surface" demo (Phase 3).

## Docs

- **EXPLAINER.md** — plain-words overview, ELI5, and the origin story (start here for the why).
- **CLAUDE.md** — how to work in this repo (conventions, commands, guardrails).
- **SPEC.md** — the full design, API reference, and the relationship to Pretext + HTML-in-Canvas.
- **ROADMAP.md** — phased tasks with acceptance + kill criteria.

## Example

```ts
import { shapeFlow, circle, subtract, Canvas2DRenderer, PretextLineSource } from 'textpour';

const source = new PretextLineSource(longText, '17px Georgia'); // one prepare pass
const region = subtract(circle(220, 220, 160), circle(220, 220, 67)); // a donut
const result = shapeFlow(source, region, { lineHeight: 24, ascent: 18 });

new Canvas2DRenderer('17px Georgia', { color: '#1a1a1a' }).render(result, ctx);
// result.overflow / result.endCursor drive auto-fit and multi-region pagination
```

MIT.
