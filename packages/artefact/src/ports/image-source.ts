// Outbound port: decode a supplied image into pixels for overlay treatment.
// Kept separate from the raster surface because decoding an untrusted supplied
// image is a different trust boundary from drawing onto our own surface.

export interface DecodedImage {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
}

export type ImageSourceRefusalReason = "UNSUPPORTED_FORMAT" | "TOO_LARGE" | "MALFORMED";

export type DecodeImageResult =
  | { readonly ok: true; readonly image: DecodedImage }
  | { readonly ok: false; readonly reason: ImageSourceRefusalReason; readonly detail: string };

export interface ImageSourcePort {
  decode(bytes: Uint8Array, declaredMediaType: string): Promise<DecodeImageResult>;
}
