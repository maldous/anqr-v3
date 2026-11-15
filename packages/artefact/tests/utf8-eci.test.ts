import assert from "node:assert/strict";
import test from "node:test";
import { dataCodewordStream, encodePayload, interleaveCodewords, makeSegment, selectVersion } from "../src/qr/encode.ts";
import { decodeSymbol } from "../src/qr/decode.ts";
import { buildSymbol } from "../src/qr/matrix.ts";
import { joinArtefactSpecification } from "../src/model/artefact-specification.ts";
import { createArtefactProducer } from "../src/application/produce-artefact.ts";
import { pngContainer, pngRasterSurface } from "../src/adapters/png-container.ts";

function decodeData(data: Uint8Array) {
  const symbol = buildSymbol(interleaveCodewords(data, 1, "L"), 1, "L", { mask: "auto" });
  return decodeSymbol(symbol.modules, symbol.size);
}

test("UTF-8 payload declares assignment 26 before its byte segment", () => {
  const segment = makeSegment("é");
  const data = dataCodewordStream(segment, 1, "L");
  assert.deepEqual([...data.slice(0, 3)], [0x71, 0xa4, 0x02]);
  assert.equal(decodeData(data).text, "é");
  for (const level of ["L", "M", "Q", "H"] as const) {
    const encoded = encodePayload("café 東京🙂", { level });
    const symbol = buildSymbol(encoded.codewords, encoded.version, level, { mask: "auto" });
    assert.equal(decodeSymbol(symbol.modules, symbol.size).text, "café 東京🙂");
  }
});

test("ECI overhead participates in capacity selection and exact-version refusal", () => {
  const segment = makeSegment("é" + "a".repeat(15));
  assert.equal(segment.characterCount, 17);
  assert.equal(selectVersion({ ...segment, eci: undefined }, "L"), 1);
  assert.equal(selectVersion(segment, "L"), 2);
  assert.throws(() => dataCodewordStream(segment, 1, "L"), /QR_PAYLOAD_TOO_LARGE/);
});

test("ASCII byte payload retains its existing header and capacity", () => {
  const segment = makeSegment("a".repeat(17));
  assert.equal(segment.eci, undefined);
  assert.equal(selectVersion(segment, "L"), 1);
  const data = dataCodewordStream(segment, 1, "L");
  assert.equal(data[0], 0x41);
  assert.equal(decodeData(data).text, "a".repeat(17));
});

test("unsupported ECI assignments and non-byte ECI consumers refuse", () => {
  const data = dataCodewordStream(makeSegment("é"), 1, "L");
  const unsupported = data.slice();
  unsupported[0] = 0x70;
  unsupported[1] = 0x34; // ECI 3, followed by byte mode.
  assert.throws(() => decodeData(unsupported), /QR_ECI_UNSUPPORTED/);
  const wrongMode = data.slice();
  wrongMode[1] = 0xa1; // ECI 26 followed by numeric mode.
  assert.throws(() => decodeData(wrongMode), /QR_ECI_BYTE_MODE_REQUIRED/);
});

test("producer refuses a forced version that cannot hold the ECI overhead", async () => {
  const supplied = { payload: "é" + "a".repeat(15), symbolVersion: 1, errorCorrectionLevel: "L", outputFormat: "png" };
  assert.equal(joinArtefactSpecification(supplied).admissible, false);
  const producer = createArtefactProducer({ containerFor: () => pngContainer, surfaceFor: pngRasterSurface, clock: { nowMs: () => 0 } });
  const refused = await producer.produce(supplied);
  assert.equal(refused.ok, false);
  if (!refused.ok) assert.equal(refused.refusal.kind, "inadmissible");
  const produced = await producer.produce({ ...supplied, symbolVersion: 2 });
  assert.equal(produced.ok, true);
  if (produced.ok) assert.equal(produced.artefact.structure.symbolVersion, 2);
});

test("leading U+FEFF is preserved as payload rather than consumed as a BOM", async () => {
  const payload = "\uFEFFhello";
  const encoded = encodePayload(payload);
  const symbol = buildSymbol(encoded.codewords, encoded.version, encoded.level, { mask: "auto" });
  assert.equal(decodeSymbol(symbol.modules, symbol.size).text, payload);
  const producer = createArtefactProducer({ containerFor: () => pngContainer, surfaceFor: pngRasterSurface, clock: { nowMs: () => 0 } });
  const produced = await producer.produce({ payload, outputFormat: "png", errorCorrectionLevel: "M" });
  assert.equal(produced.ok, true);
  if (produced.ok) assert.equal(produced.artefact.scanSafety.decodedPayload, payload);
});
