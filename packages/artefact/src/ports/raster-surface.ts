// Outbound port: draw onto a pixel surface without naming a rasteriser.
// Outbound means the application layer DRIVES this, and an adapter is injected
// at composition rather than imported.

export interface Rgba {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
  readonly alpha: number;
}

export interface RasterSurfacePort {
  readonly width: number;
  readonly height: number;
  fill(colour: Rgba): void;
  fillRect(x: number, y: number, width: number, height: number, colour: Rgba): void;
  /** Row-major RGBA bytes, four per pixel, for whatever encodes the container. */
  pixels(): Uint8Array;
}
