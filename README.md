# textpour

A render-agnostic **text-geometry kernel** on top of
[`@chenglou/pretext`](https://github.com/chenglou/pretext).

- **Shape-flow — the reusable core.** Turn any 2D region — circles, ellipses, polygons, boolean
  unions/intersections/**holes**, SVG paths, glyph outlines, raster alpha masks — into the per-row
  spans Pretext fills, threading one cursor across the *several disjoint spans* a single row can have
  (around a hole, through a glyph's counters). This shape→spans geometry is the part worth a library.
  (CSS `shape-inside` never shipped; this does it.)
- **Cursor ↔ point mapping**: map pixel positions to exact grapheme positions and back, for
  caret/hit-testing in custom-rendered text.
- **Conveniences over the line breaker** (nice-to-haves, *not* the moat): justification, soft-
  hyphenation, balanced lines, auto-fit, conservative band sampling — pragmatic implementations over
  the *published* `@chenglou/pretext@0.0.1`; Pretext's fuller API does several of these natively.
- **Pluggable paint**: the kernel computes geometry; `Renderer`s paint it. Canvas2D today; an
  HTML-in-Canvas adapter (high-fidelity, accessible, 3D-surface paint) is stubbed for later.

The design bet is the **plan/paint split**: Pretext plans cheaply every frame (no DOM reflow); an
expensive high-fidelity backend paints only when the plan changes.

## Demo

Text poured into a circle and a donut (multi-span), reflowing live as the region changes — the same
prepared pass reused on every frame:

![textpour demo: text flowing into a circle and a donut, reflowing live](assets/textpour-demo.gif)

A gallery of practical demos lives in `demo/` — serve over http (`npm run build` first) and open
**`demo/gallery.html`**. Start with **Anatomy**, which runs raw Pretext and textpour *side by side*:
identical pixels for a circle (just inline the loop), and the spans function ballooning into a
rasterizer for a glyph (reuse the library). The rest — Islands, Letterform, Ghostwriter, Reflow,
Touchpoint — isolate one capability each, with a "textpour vs raw Pretext" code panel on every page.

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

In one line: **Pretext breaks the lines; textpour decides the shape those lines fill.** The flow loop
on top is ~12 lines you could inline — what textpour actually packages is `region.spansAt(y)` for
shapes Pretext has no concept of. A convenience kernel, not a new capability. (See the **Anatomy**
demo for the side-by-side proof.)

## Quickstart

```bash
npm install
npm test          # builds, runs the pure-logic test suite (56 specs)
npm run build     # emits dist/
# demo (needs a browser + http):
npx http-server . # or any static server
# open /demo/gallery.html
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

## Example — Pretext vs textpour

Pour text into a column with a hole, both ways — the contrast every demo shows ([live](demo/gallery.html)):

```js
// raw Pretext: you write the loop AND the geometry
let cur = { segmentIndex: 0, graphemeIndex: 0 };
const spansAt = (yc) => {                                  // column minus the hole's chord
  const h = 90 * 90 - (yc - 200) ** 2;
  return h <= 0 ? [[0, 600]] : [[0, 300 - Math.sqrt(h)], [300 + Math.sqrt(h), 600]];
};
for (let y = 0; y + 26 <= 400; y += 26)
  for (const [x0, x1] of spansAt(y + 13)) {
    const line = layoutNextLine(prepared, cur, x1 - x0);  // one cursor across the gap
    if (!line) break;
    ctx.fillText(line.text, x0, y + 20); cur = line.end;
  }
```

```ts
// textpour: describe the shape, pour
const region = subtract(rect(0, 0, 600, 400), circle(300, 200, 90));
const result = shapeFlow(source, region, { lineHeight: 26, ascent: 20, multiSpan: 'fill' });
renderer.render(result, ctx);
```

Same output. The loop is glue; **`region` is the part textpour gives you** — and it scales to glyphs,
masks, and booleans without touching `spansAt`. [Anatomy](demo/anatomy.html) runs both, pixel-for-pixel.

MIT.
