import type { ContainerEncoderPort, EncodedContainer, Frame } from "../ports/container-encoder.ts";

// SVG: encode only, one frame, no rasteriser.
//
// The declared objective calls this "the only container needing no rasteriser",
// and that is exactly the capability distinction preserved here. SVG carries no
// frame timing in this implementation, so more than one frame is refused rather
// than silently flattened, and supportsAnimation is false.
//
// Runs of identical horizontal pixels are merged into one rect. For a QR
// artefact that is a large reduction and remains exact, whereas one rect per
// pixel would be exact and unusable.

const CHANNELS = 4;

function colourAt(frame: Frame, x: number, y: number): string {
  const offset = (y * frame.width + x) * CHANNELS;
  const red = frame.pixels[offset] as number;
  const green = frame.pixels[offset + 1] as number;
  const blue = frame.pixels[offset + 2] as number;
  const alpha = frame.pixels[offset + 3] as number;
  if (alpha === 0) return "none";
  const hex = `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
  return alpha === 255 ? hex : `${hex};${(alpha / 255).toFixed(3)}`;
}

export const svgContainer: ContainerEncoderPort = {
  mediaType: "image/svg+xml",
  supportsAnimation: false,

  async encode(frames: readonly Frame[]): Promise<EncodedContainer> {
    if (frames.length === 0) throw new Error("CONTAINER_NO_FRAMES");
    if (frames.length > 1) throw new Error("CONTAINER_ANIMATION_UNSUPPORTED");
    const frame = frames[0] as Frame;
    if (frame.pixels.length !== frame.width * frame.height * CHANNELS) throw new Error("CONTAINER_FRAME_MALFORMED");

    const rects: string[] = [];
    for (let y = 0; y < frame.height; y += 1) {
      let runStart = 0;
      let runColour = colourAt(frame, 0, y);
      for (let x = 1; x <= frame.width; x += 1) {
        const colour = x === frame.width ? null : colourAt(frame, x, y);
        if (colour === runColour) continue;
        if (runColour !== "none") {
          const [fill, opacity] = runColour.split(";");
          const opacityAttribute = opacity === undefined ? "" : ` fill-opacity="${opacity}"`;
          rects.push(`<rect x="${runStart}" y="${y}" width="${x - runStart}" height="1" fill="${fill}"${opacityAttribute}/>`);
        }
        runStart = x;
        runColour = colour ?? "none";
      }
    }

    const document = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${frame.width}" height="${frame.height}"`,
      ` viewBox="0 0 ${frame.width} ${frame.height}" shape-rendering="crispEdges">`,
      rects.join(""),
      `</svg>`,
    ].join("");
    return { bytes: new TextEncoder().encode(document), mediaType: this.mediaType };
  },
};
