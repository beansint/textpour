// We depend on a small, stable subset of @chenglou/pretext. The published package ships raw .ts
// source (with .ts import specifiers) which tsc cannot typecheck under NodeNext. Pinning the subset
// here keeps our build clean AND documents precisely what we rely on. Runtime resolution still uses
// the real package (this file is type-only; the emitted JS keeps the bare '@chenglou/pretext' import).
//
// Mapped in via tsconfig "paths". When the npm package catches up to the GitHub README
// (layoutNextLineRange / materializeLineRange / measureLineStats / prepare options), extend this.

declare module '@chenglou/pretext' {
  export type LayoutCursor = {
    segmentIndex: number;
    graphemeIndex: number;
  };

  export type LayoutLine = {
    text: string;
    width: number;
    start: LayoutCursor;
    end: LayoutCursor;
  };

  /** Opaque handle returned by prepareWithSegments; we only pass it through. */
  export type PreparedTextWithSegments = {
    readonly __preparedWithSegments: unique symbol;
  };

  export function prepareWithSegments(text: string, font: string): PreparedTextWithSegments;

  export function layoutNextLine(
    prepared: PreparedTextWithSegments,
    start: LayoutCursor,
    maxWidth: number,
  ): LayoutLine | null;
}
