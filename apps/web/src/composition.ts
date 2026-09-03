import { createArtefactProducer, type ArtefactProducer, type OutputFormat, type ProducedArtefact } from "../../../packages/artefact/src/application/produce-artefact.ts";
import { gifContainer } from "../../../packages/artefact/src/adapters/gif-container.ts";
import { pngContainer } from "../../../packages/artefact/src/adapters/png-container.ts";
import { svgContainer } from "../../../packages/artefact/src/adapters/svg-container.ts";
import { createPixelSurface } from "../../../packages/artefact/src/adapters/pixel-surface.ts";
import { systemClock } from "../../../packages/artefact/src/adapters/system-clock.ts";
import type { ContainerEncoderPort } from "../../../packages/artefact/src/ports/container-encoder.ts";

// The composition root.
//
// This is the one module permitted to name a concrete adapter, which is why the
// architecture states permits delivery -> adapters explicitly. The application
// layer still may not, and that asymmetry is what keeps the centre replaceable:
// swapping a container here changes nothing above it.

const CONTAINERS: Readonly<Record<OutputFormat, ContainerEncoderPort>> = {
  svg: svgContainer,
  png: pngContainer,
  gif: gifContainer,
};

export function containerFor(format: OutputFormat): ContainerEncoderPort {
  const container = CONTAINERS[format];
  if (container === undefined) throw new Error(`COMPOSITION_CONTAINER_UNKNOWN:${format}`);
  return container;
}

export function createProducer(): ArtefactProducer {
  return createArtefactProducer({
    containerFor,
    surfaceFor: createPixelSurface,
    clock: systemClock,
  });
}

/** Base64 without Buffer, so the same code runs in a browser and under test. */
function toBase64(bytes: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index] as number;
    const b = index + 1 < bytes.length ? (bytes[index + 1] as number) : 0;
    const c = index + 2 < bytes.length ? (bytes[index + 2] as number) : 0;
    out += alphabet[a >> 2];
    out += alphabet[((a & 3) << 4) | (b >> 4)];
    out += index + 1 < bytes.length ? alphabet[((b & 15) << 2) | (c >> 6)] : "=";
    out += index + 2 < bytes.length ? alphabet[c & 63] : "=";
  }
  return out;
}

/**
 * A preview produced by the same container the actor chose, so what is shown is
 * what would be exported rather than a separate rendering path that could
 * disagree with it.
 */
export async function previewDataUrl(artefact: ProducedArtefact): Promise<string> {
  const container = containerFor(artefact.specification.outputFormat);
  const encoded = await container.encode([artefact.frame]);
  return `data:${encoded.mediaType};base64,${toBase64(encoded.bytes)}`;
}

/** Hands bytes to the actor. Isolated so a test can observe delivery. */
export function deliverToBrowser(bytes: Uint8Array, mediaType: string, fileName: string): void {
  const blob = new Blob([bytes as BlobPart], { type: mediaType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
