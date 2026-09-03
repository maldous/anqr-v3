import assert from "node:assert/strict";
import test from "node:test";

import { encodePayload, makeSegment, selectMode, selectVersion } from "../src/qr/encode.ts";
import { buildSymbol, penaltyScore } from "../src/qr/matrix.ts";
import { decodeSymbol } from "../src/qr/decode.ts";
import { ERROR_CORRECTION_LEVELS, blockLayout, dataCodewords, symbolSize, totalCodewords } from "../src/qr/spec.ts";
import { decodeBlock, encodeBlock } from "../src/qr/reed-solomon.ts";
import { gfDivide, gfInverse, gfMultiply } from "../src/qr/galois.ts";

// The recorded ANQR limitation was a codec that produced a plausible option
// surface around a matrix that decoded to the empty string. These tests exist
// to make that failure mode impossible to reproduce silently: every assertion
// below compares a decoded payload against the exact input.

function render(text: string, level: Parameters<typeof encodePayload>[1] = {}) {
  const encoded = encodePayload(text, level);
  const symbol = buildSymbol(encoded.codewords, encoded.version, encoded.level, { mask: "auto" });
  return { encoded, symbol };
}

test("known capacity figures are derived, not asserted", () => {
  assert.equal(totalCodewords(1), 26);
  assert.equal(dataCodewords(1, "L"), 19);
  assert.equal(dataCodewords(1, "M"), 16);
  assert.equal(dataCodewords(1, "Q"), 13);
  assert.equal(dataCodewords(1, "H"), 9);
  assert.equal(totalCodewords(5), 134);
  assert.equal(dataCodewords(5, "Q"), 62);
  assert.equal(totalCodewords(7), 196);
  assert.equal(dataCodewords(7, "H"), 66);
  assert.equal(totalCodewords(40), 3706);
  assert.equal(dataCodewords(40, "L"), 2956);
  assert.equal(symbolSize(1), 21);
  assert.equal(symbolSize(40), 177);
});

test("block layout accounts for every data codeword at every version and level", () => {
  for (let version = 1; version <= 40; version += 1) {
    for (const level of ERROR_CORRECTION_LEVELS) {
      const layout = blockLayout(version, level);
      const accounted =
        layout.shortBlockCount * layout.shortBlockDataLength +
        (layout.blocks - layout.shortBlockCount) * (layout.shortBlockDataLength + 1);
      assert.equal(accounted, dataCodewords(version, level), `v${version}-${level}`);
      assert.ok(layout.shortBlockCount > 0 && layout.shortBlockCount <= layout.blocks, `v${version}-${level} split`);
    }
  }
});

test("GF(256) is a field: inverses, associativity and division round-trip", () => {
  for (let value = 1; value < 256; value += 1) {
    assert.equal(gfMultiply(value, gfInverse(value)), 1, `inverse of ${value}`);
  }
  for (let a = 1; a < 256; a += 7) {
    for (let b = 1; b < 256; b += 11) {
      assert.equal(gfDivide(gfMultiply(a, b), b), a, `${a}*${b}/${b}`);
      assert.equal(gfMultiply(a, b), gfMultiply(b, a), `commutativity ${a},${b}`);
    }
  }
});

test("Reed-Solomon corrects up to half the EC codewords and refuses beyond", () => {
  const data = new Uint8Array(Array.from({ length: 16 }, (_, index) => (index * 37 + 11) & 0xff));
  const ecLength = 10;
  const ec = encodeBlock(data, ecLength);
  const clean = new Uint8Array([...data, ...ec]);

  assert.deepEqual(decodeBlock(clean, ecLength).data, data);
  assert.equal(decodeBlock(clean, ecLength).errorsCorrected, 0);

  for (let errors = 1; errors <= ecLength / 2; errors += 1) {
    const damaged = clean.slice();
    for (let index = 0; index < errors; index += 1) {
      damaged[index * 2] = (damaged[index * 2] as number) ^ 0x5a;
    }
    const decoded = decodeBlock(damaged, ecLength);
    assert.deepEqual(decoded.data, data, `${errors} planted errors`);
    assert.equal(decoded.errorsCorrected, errors, `${errors} located`);
  }

  const beyond = clean.slice();
  for (let index = 0; index < ecLength / 2 + 2; index += 1) {
    beyond[index] = (beyond[index] as number) ^ 0xff;
  }
  assert.throws(() => decodeBlock(beyond, ecLength), /RS_UNCORRECTABLE/);
});

test("every version round-trips at every error-correction level", () => {
  for (let version = 1; version <= 40; version += 1) {
    for (const level of ERROR_CORRECTION_LEVELS) {
      const capacity = dataCodewords(version, level);
      // Fill most of the version so the selected version is the intended one.
      const text = "A".repeat(Math.max(1, capacity - 3));
      const segment = makeSegment(text, "byte");
      const selected = selectVersion(segment, level, version);
      if (selected !== version) continue;
      const encoded = encodePayload(text, { level, minimumVersion: version, mode: "byte" });
      assert.equal(encoded.version, version, `v${version}-${level} version`);
      const symbol = buildSymbol(encoded.codewords, encoded.version, encoded.level, { mask: "auto" });
      const decoded = decodeSymbol(symbol.modules, symbol.size);
      assert.equal(decoded.text, text, `v${version}-${level} payload`);
      assert.equal(decoded.version, version, `v${version}-${level} decoded version`);
      assert.equal(decoded.level, level, `v${version}-${level} decoded level`);
      assert.equal(decoded.errorsCorrected, 0, `v${version}-${level} clean`);
    }
  }
});

test("all eight masks round-trip and are individually selectable", () => {
  const text = "https://anqr.link/experience";
  for (let mask = 0; mask < 8; mask += 1) {
    const encoded = encodePayload(text, { level: "H" });
    const symbol = buildSymbol(encoded.codewords, encoded.version, encoded.level, { mask });
    assert.equal(symbol.mask, mask, `mask ${mask} recorded`);
    const decoded = decodeSymbol(symbol.modules, symbol.size);
    assert.equal(decoded.text, text, `mask ${mask} payload`);
    assert.equal(decoded.mask, mask, `mask ${mask} recovered`);
  }
});

test("automatic mask selection picks the lowest penalty score", () => {
  const encoded = encodePayload("https://anqr.link", { level: "M" });
  const auto = buildSymbol(encoded.codewords, encoded.version, encoded.level, { mask: "auto" });
  const scores: number[] = [];
  for (let mask = 0; mask < 8; mask += 1) {
    const forced = buildSymbol(encoded.codewords, encoded.version, encoded.level, { mask });
    scores.push(penaltyScore(forced.modules, forced.size));
  }
  const best = Math.min(...scores);
  assert.equal(penaltyScore(auto.modules, auto.size), best);
  assert.equal(scores.indexOf(best), auto.mask);
});

test("each encoding mode is selected and round-trips through its own path", () => {
  const cases: Array<{ text: string; mode: "numeric" | "alphanumeric" | "byte" }> = [
    { text: "0123456789", mode: "numeric" },
    { text: "12345678901", mode: "numeric" },
    { text: "HELLO WORLD", mode: "alphanumeric" },
    { text: "ANQR-1.0:TEST", mode: "alphanumeric" },
    { text: "https://anqr.link/a?b=c", mode: "byte" },
    { text: "Grüße 世界 🌍", mode: "byte" },
  ];
  for (const { text, mode } of cases) {
    assert.equal(selectMode(text), mode, `mode of ${text}`);
    const { encoded, symbol } = render(text, { level: "Q" });
    assert.equal(encoded.mode, mode);
    const decoded = decodeSymbol(symbol.modules, symbol.size);
    assert.equal(decoded.text, text, `payload ${text}`);
    assert.equal(decoded.mode, mode, `decoded mode ${text}`);
  }
});

test("a damaged symbol still decodes within the level's correction budget", () => {
  const text = "https://anqr.link/damaged-but-readable";
  const encoded = encodePayload(text, { level: "H" });
  const symbol = buildSymbol(encoded.codewords, encoded.version, encoded.level, { mask: "auto" });
  const layout = blockLayout(encoded.version, "H");

  // Damage whole modules in the data region, staying inside the budget.
  const damaged = symbol.modules.slice();
  const correctable = Math.floor(layout.ecPerBlock / 2);
  let flipped = 0;
  for (let y = symbol.size - 2; y >= 9 && flipped < correctable; y -= 1) {
    for (let x = symbol.size - 2; x >= 9 && flipped < correctable; x -= 3) {
      damaged[y * symbol.size + x] ^= 1;
      flipped += 1;
    }
  }
  assert.ok(flipped > 0, "damage was actually planted");

  const decoded = decodeSymbol(damaged, symbol.size);
  assert.equal(decoded.text, text, "payload survived planted damage");
  assert.ok(decoded.errorsCorrected > 0, "correction actually ran");
});

test("payloads beyond version 40 capacity are refused, not truncated", () => {
  assert.throws(() => encodePayload("A".repeat(3000), { level: "H" }), /QR_PAYLOAD_TOO_LARGE/);
});

test("encoding is deterministic across repeated runs", () => {
  const text = "https://anqr.link/deterministic";
  const first = render(text, { level: "Q" });
  const second = render(text, { level: "Q" });
  assert.deepEqual(first.symbol.modules, second.symbol.modules);
  assert.equal(first.symbol.mask, second.symbol.mask);
  assert.equal(first.symbol.version, second.symbol.version);
});
