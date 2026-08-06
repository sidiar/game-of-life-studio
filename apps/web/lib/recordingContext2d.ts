/**
 * A hand-rolled Canvas2D recording double (Story 1.8 Task 6). jsdom implements `<canvas>` the
 * element but `getContext('2d')` returns `null` without the native `canvas` package — and this
 * project declines to add `canvas` (native build, install fragility on an `engine-strict` Node 24
 * repo) or `vitest-canvas-mock` (an unmaintained jest port), the same call Story 1.7 made when it
 * declined a colour-science library.
 *
 * Implements only the members `gridRenderer.ts` actually uses (`./gridRenderer`'s `Canvas2D`
 * alias) and records an ordered call log plus every `fillStyle` assignment, in sequence — enough
 * for gridRenderer.test.ts to assert draw order, batching call counts, and fill colours without a
 * single pixel ever being rasterised.
 *
 * Test-only: never imported by component code, matching the `paletteCvd.ts` convention. It carries
 * no colour literals, so it needs no AR-46 whitelist entry.
 */
import { vi } from 'vitest';

type FillStyleValue = string | CanvasGradient | CanvasPattern;

export interface RecordedCall {
  readonly op: 'fillRect' | 'beginPath' | 'rect' | 'fill' | 'drawImage' | 'setTransform';
  readonly args: readonly unknown[];
}

export class RecordingContext2D {
  readonly calls: RecordedCall[] = [];
  // Every fillStyle write, in assignment order — separate from `calls` because fillStyle is a
  // property write, not a method call, and gridRenderer.test.ts's "exactly one fillStyle write
  // per group" assertions read more clearly against this than against a mixed log.
  readonly fillStyleWrites: FillStyleValue[] = [];

  // Placeholder only — never read before the first assignment in practice, and a named CSS
  // colour (not a hex/hsl literal) so this test-only file needs no AR-46 whitelist entry.
  private currentFillStyle: FillStyleValue = 'black';

  get fillStyle(): FillStyleValue {
    return this.currentFillStyle;
  }

  set fillStyle(value: FillStyleValue) {
    this.currentFillStyle = value;
    this.fillStyleWrites.push(value);
  }

  fillRect(x: number, y: number, width: number, height: number): void {
    this.calls.push({ op: 'fillRect', args: [x, y, width, height] });
  }

  beginPath(): void {
    this.calls.push({ op: 'beginPath', args: [] });
  }

  rect(x: number, y: number, width: number, height: number): void {
    this.calls.push({ op: 'rect', args: [x, y, width, height] });
  }

  fill(): void {
    this.calls.push({ op: 'fill', args: [] });
  }

  drawImage(image: CanvasImageSource, dx: number, dy: number): void {
    this.calls.push({ op: 'drawImage', args: [image, dx, dy] });
  }

  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.calls.push({ op: 'setTransform', args: [a, b, c, d, e, f] });
  }
}

/**
 * Installs a RecordingContext2D as `canvas`'s '2d' context by spying on
 * `HTMLCanvasElement.prototype.getContext`. Any OTHER canvas (GridRenderer's own offscreen
 * grid-line overlay) gets real, unmocked jsdom behaviour — `null` — which is exactly the
 * "cache unavailable, fall back to direct drawing" path Task 5 must degrade through.
 */
export function installRecordingContext2d(canvas: HTMLCanvasElement): RecordingContext2D {
  const context = new RecordingContext2D();

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    if (this !== canvas) return null;
    // The one cast in this file: getContext's declared return type is the full lib.dom
    // CanvasRenderingContext2D, but RecordingContext2D implements only the narrow Canvas2D
    // subset gridRenderer.ts actually reads through — that subset doesn't overlap enough with
    // the full interface for a direct cast, so `unknown` is the required stepping stone.
    return context as unknown as CanvasRenderingContext2D;
  });

  return context;
}
