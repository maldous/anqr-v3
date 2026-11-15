import type { RasterSurfacePort, Rgba } from "../ports/raster-surface.ts";

// Shared in-memory RGBA surface. Both raster containers need the same surface,
// and duplicating it in each would let the two drift apart while the type
// checker stayed happy.

const CHANNELS = 4;

export function createPixelSurface(width: number, height: number): RasterSurfacePort {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error("RASTER_SURFACE_DIMENSIONS_INVALID");
  }
  const pixels = new Uint8Array(width * height * CHANNELS);

  const put = (x: number, y: number, colour: Rgba): void => {
    const offset = (y * width + x) * CHANNELS;
    pixels[offset] = colour.red;
    pixels[offset + 1] = colour.green;
    pixels[offset + 2] = colour.blue;
    pixels[offset + 3] = colour.alpha;
  };

  return {
    width,
    height,
    fill(colour: Rgba): void {
      for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) put(x, y, colour);
    },
    fillRect(x: number, y: number, rectWidth: number, rectHeight: number, colour: Rgba): void {
      // Clipped rather than refused: a caller drawing a quiet zone at the edge
      // legitimately describes a rectangle that runs past the surface.
      const left = Math.max(0, Math.trunc(x));
      const top = Math.max(0, Math.trunc(y));
      const right = Math.min(width, Math.trunc(x + rectWidth));
      const bottom = Math.min(height, Math.trunc(y + rectHeight));
      for (let row = top; row < bottom; row += 1) for (let column = left; column < right; column += 1) put(column, row, colour);
    },
    pixels(): Uint8Array {
      // A copy: a surface that handed out its own buffer would let a container
      // mutate the frame it was given.
      return pixels.slice();
    },
  };
}
