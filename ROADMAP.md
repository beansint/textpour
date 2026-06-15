# ROADMAP

Phased build plan. Each phase has acceptance criteria. Start at the first unchecked item.

## Phase 0 — Kernel scaffold ✅ DONE

The plan/paint seam is standing and the pure core is verified.

- [x] Types & coordinate model (`types.ts`).
- [x] `Region` + interval algebra + Rect/Circle/Ellipse/Polygon/Composite + builders (`region.ts`).
- [x] `LineSource` seam + `MonospaceLineSource` (`line-source.ts`).
- [x] `PretextLineSource` — `prepareWithSegments` + `layoutNextLine` wiring (`pretext-source.ts`).
- [x] Prefix-width cursor↔point index (`prefix-widths.ts`).
- [x] `shapeFlow` orchestrator + `ShapeFlow` reflow (`flow.ts`).
- [x] `Renderer` seam: `Canvas2DRenderer` (works) + `HtmlInCanvasRenderer` (stub) (`renderer.ts`).
- [x] 19 passing `node:test` specs (region, flow incl. donut multi-span, prefix-widths).
- [x] Browser demo (circle + donut + reflow slider).

**Acceptance met:** `npm test` green; demo renders text into a shape with real Pretext.

## Phase 1 — Shape-flow quality (the moat)

Make it good, not just a toy. This is where the project earns its keep.

- [x] **Verify multi-span on real Pretext in the browser** (the cursor trick is unit-tested with the
      monospace source; confirm with `PretextLineSource` in a donut and a concave polygon).
- [x] **Soft-hyphen support**: accept pre-inserted soft hyphens; when one wins a break, the
      materialized line should carry the trailing `-`. (Pretext treats soft hyphens as optional
      break points.) Provide a conservative, locale-aware insertion helper.
- [x] **Justification** (`align: 'justify'`): distribute `span.width - line.width` across inter-word
      gaps. Requires per-word x positions — either a per-word measurement pass or the unreleased
      `materializeLineRange`/rich-inline API. Renderer must draw words at computed x, not the whole
      line string.
- [x] **Balanced lines**: binary-search candidate widths (via a non-materializing stats walk when the
      range API ships; `measureLineStats`/`walkLineRanges`) until line count + ragged edge are nice.
- [x] **Auto-fit**: binary-search font size so text exactly fills a region. Note: `prepare` is keyed
      on `(text, font)`, so each size is a fresh prepare — cache hard, binary-search not linear.
- [x] **Region from outline**: build a `Region` from an SVG path (flatten → polygon) and from a glyph
      outline (opentype.js). Add a raster/alpha-mask region.
- [ ] **Conservative band sampling option**: intersect inside-intervals across the whole row band so
      text never poke outside tight curves.

**Acceptance:** justified text fills a glyph-shaped region with no overflow and acceptable rivers;
reflow stays smooth dragging a moving obstacle at 60fps (prepare reused).

## Phase 2 — Render fidelity

- [ ] **Implement `HtmlInCanvasRenderer`** per the `renderer.ts` comments: `layoutsubtree` canvas, one
      styled child per line, `drawElementImage` in the `paint` event, transform write-back. Feature-
      detect with `isSupported()`; fall back to `Canvas2DRenderer`.
- [ ] **SVG renderer**: emit `<text>`/`<tspan>` per line for crisp export.
- [ ] **WebGL adapter notes / minimal path** (atlas or HiC `texElementImage2D`).

**Acceptance:** same `FlowResult` renders identically (modulo fidelity) through Canvas2D and HiC on a
flagged Chrome; graceful fallback elsewhere.

## Phase 3 — Flagship demo

- [ ] **Pretext-planned shape-flow → HTML-in-Canvas → 3D surface.** Use three.js (HiC
      `texElementImage2D` / the html-texture path) to map shaped, real-CSS text onto a rotating
      surface. This is the single artifact impossible with either library alone.

**Acceptance:** a recorded demo of CSS-accurate shaped text on a 3D surface, reflowing live.

## Phase 4 — Editing core (project D), OPTIONAL

Only if you want the higher-ceiling path. Front-loads the two hardest problems; HTML-in-Canvas eats
the easy 80% on Chrome, so build this only for canvas/WebGL-native or custom editing semantics.

- [ ] Document model (string/rich runs) + selection (anchor/focus) + undo/redo.
- [ ] Caret rect + selection rects from the prefix-width index.
- [ ] Point→caret hit-testing (reuse `xToGraphemeIndex`), grapheme-correct backspace/word-select.
- [ ] **Incremental prepare**: chunk by paragraph; re-`prepare` only the edited paragraph. (Hardest
      perf problem in the whole project.)
- [ ] **Hidden DOM input proxy** for IME/composition/clipboard/a11y (the trick Monaco/CodeMirror use).
- [ ] **Bidi caret movement** via Pretext `segLevels` (needs the unreleased rich handle); accept that
      sub-segment Arabic glyph x-placement is approximate.

**Acceptance:** a canvas editor with correct caret/selection across emoji + a basic RTL line, IME
working, editing a long doc without per-keystroke full re-prepare.

## Kill criteria (when to stop / not build)

- Don't build for revenue — text-art libraries monetize poorly.
- Don't build Phase 2/3 (HiC) **first** — Chrome-only flag, will move under you.
- Don't ship Phase 1 half-done (ragged single-span only) and call it a library — that's the toy.
- Phase 4 only if you specifically want canvas-native/WebGL/custom editing; otherwise a real
  `contenteditable` composited via HTML-in-Canvas is the cheaper answer on Chrome.
