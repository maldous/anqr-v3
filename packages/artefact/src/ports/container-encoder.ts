// Outbound port: encode frames into a delivered container.
// One port for every container, so a still SVG and an animated GIF differ only
// in which adapter is injected.

export interface Frame {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
  readonly durationMs: number;
}

export interface EncodedContainer {
  readonly bytes: Uint8Array;
  readonly mediaType: string;
}

export interface ContainerEncoderPort {
  readonly mediaType: string;
  readonly supportsAnimation: boolean;
  encode(frames: readonly Frame[]): Promise<EncodedContainer>;
}
