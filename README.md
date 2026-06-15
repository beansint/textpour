# textpour

A render-agnostic **text-geometry kernel** on top of
[`@chenglou/pretext`](https://github.com/chenglou/pretext).

- **Shape-flow**: pour text into arbitrary 2D regions — circles, polygons, holes, boolean
  combinations — by routing Pretext's line-breaking through per-row spans. (CSS `shape-inside` never
  shipped; this does it.)
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

## Quickstart

```bash
npm install
npm test          # builds, runs the pure-logic test suite (19 specs)
npm run build     # emits dist/
# demo (needs a browser + http):
npx http-server . # or any static server
# open /demo/index.html
```

## Status

Phase 0 (kernel scaffold) is complete and tested. See **ROADMAP.md** for what's next — shape-flow
quality (justification, hyphenation, auto-fit), then the HTML-in-Canvas renderer, then the flagship
"shaped CSS text on a 3D surface" demo.

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
