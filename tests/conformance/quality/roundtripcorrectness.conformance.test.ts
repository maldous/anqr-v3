import assert from "node:assert/strict";
import { test } from "node:test";
import * as capability from "../../../src/capabilities/quality/roundtripcorrectness.ts";

function embeddedBody(artefact: capability.Artefact): string {
  const sepIndex = artefact.checksum.indexOf("::");
  assert.ok(sepIndex >= 0, "artefact must embed its encoded body after the checksum");
  return artefact.checksum.slice(sepIndex + 2);
}

test("architectureartefactroundtrip", () => {
  const payload: capability.Payload = { kind: "url", content: "https://example.com/roundtrip" };
  const style: capability.StyleCustomisation = {
    foreground: "#000000",
    background: "#FFFFFF",
    eyeShape: "rounded",
    moduleShape: "circle",
  };

  for (const level of capability.ERROR_CORRECTION_LEVELS) {
    const options: capability.CreationOptions = { payload, errorCorrection: level, style };
    const outcome = capability.createArtefact(options, capability.defaultAudit);
    assert.strictEqual(outcome.success, true, `creation must succeed at level "${level}"`);
    if (!outcome.success) continue;

    assert.strictEqual(
      outcome.artefact.version,
      capability.ARTEFACT_VERSION,
      "artefact must carry the claimed version",
    );

    const decoded = capability.decodeArtefact(embeddedBody(outcome.artefact));
    assert.deepStrictEqual(
      decoded.payload,
      payload,
      `artefact must decode to exactly the requested payload at level "${level}"`,
    );
    assert.strictEqual(decoded.errorCorrection, level);
    assert.deepStrictEqual(decoded.style, style);
  }

  // The module exposes no partial-damage correction machinery, so the closest
  // exposed behaviour for the damage clause is that a damaged artefact is
  // detected by decoding and refused rather than yielding a payload other
  // than the requested one.
  const outcome = capability.createArtefact({ payload, errorCorrection: "H" }, capability.defaultAudit);
  assert.strictEqual(outcome.success, true);
  if (!outcome.success) return;
  const damaged: capability.Artefact = {
    version: outcome.artefact.version,
    payload: outcome.artefact.payload,
    checksum: outcome.artefact.checksum.replace(payload.content, payload.content + "-damaged"),
  };
  const verdict = capability.defaultAudit({ payload, errorCorrection: "H" }, damaged);
  assert.strictEqual(verdict.success, false, "a damaged artefact must not pass the decode audit");
  if (!verdict.success) {
    assert.strictEqual(verdict.error.code, "ROUNDTRIP_MISMATCH");
  }
});

test("roundtripcorrectnesscontracts", () => {
  const reports = capability.validateRoundTripVectors();
  assert.strictEqual(
    reports.length,
    capability.ROUND_TRIP_VECTORS.length,
    "every canonical vector must be exercised",
  );
  for (const report of reports) {
    assert.strictEqual(
      report.outcome.success,
      true,
      `accepted request for kind "${report.vector.kind}" at level "${report.vector.errorCorrection}" must decode to its payload`,
    );
  }

  const payload: capability.Payload = {
    kind: "text",
    content: "hello contracts",
    metadata: { lang: "en", campaign: "q3" },
  };
  const options: capability.CreationOptions = {
    payload,
    errorCorrection: "Q",
    overlay: { logo: { data: "LOGO", size: 48 }, frame: { label: "SCAN", color: "#FF0000" } },
    animation: { enabled: true, speed: "fast" },
  };
  const outcome = capability.createArtefact(options, capability.defaultAudit);
  assert.strictEqual(outcome.success, true, "a valid request must be accepted");
  if (!outcome.success) return;

  const decoded = capability.decodeArtefact(embeddedBody(outcome.artefact));
  assert.strictEqual(decoded.payload.kind, payload.kind);
  assert.strictEqual(decoded.payload.content, payload.content);
  assert.deepStrictEqual(decoded.payload.metadata, payload.metadata);
  assert.strictEqual(decoded.errorCorrection, options.errorCorrection);
  assert.deepStrictEqual(decoded.overlay, options.overlay);
  assert.deepStrictEqual(decoded.animation, options.animation);
});

test("roundtripcorrectnesserrormodel", () => {
  // The '|' in this content collides with the encoding's segment separator,
  // so the artefact cannot decode back to the request: creation must refuse
  // rather than return an artefact violating the invariant.
  const unroundtrippable: capability.CreationOptions = {
    payload: { kind: "text", content: "left|EC=H" },
    errorCorrection: "M",
  };
  const refused = capability.createArtefact(unroundtrippable, capability.defaultAudit);
  assert.strictEqual(refused.success, false, "creation must refuse when the invariant cannot be met");
  if (!refused.success) {
    assert.strictEqual(refused.error.code, "ROUNDTRIP_MISMATCH");
    assert.strictEqual(refused.error.role, "alert");
    assert.strictEqual("artefact" in refused, false, "a refusal must not carry an artefact");
  }

  const valid: capability.CreationOptions = {
    payload: { kind: "text", content: "plain" },
    errorCorrection: "M",
  };

  const failingAudit = (): capability.ValidationOutcome => ({
    success: false,
    error: { message: "forced refusal", code: "ROUNDTRIP_MISMATCH", role: "alert" },
  });
  const denied = capability.createArtefact(valid, failingAudit);
  assert.strictEqual(denied.success, false, "an audit failure must deny creation");
  if (!denied.success) {
    assert.strictEqual(denied.error.code, "ROUNDTRIP_MISMATCH");
  }

  const throwingAudit = (): capability.ValidationOutcome => {
    throw new Error("audit refused");
  };
  const thrown = capability.createArtefact(valid, throwingAudit);
  assert.strictEqual(thrown.success, false, "a throwing audit must deny creation");
  if (!thrown.success) {
    assert.strictEqual(thrown.error.code, "ROUNDTRIP_MISMATCH");
  }

  const emptyContent = capability.createArtefact(
    { payload: { kind: "text", content: "" }, errorCorrection: "M" },
    capability.defaultAudit,
  );
  assert.strictEqual(emptyContent.success, false, "empty payload content must be refused");
  if (!emptyContent.success) {
    assert.strictEqual(emptyContent.error.code, "INVALID_PAYLOAD_CONTENT");
  }

  const badKind = capability.createArtefact(
    {
      payload: { kind: "barcode" as unknown as capability.PayloadKind, content: "x" },
      errorCorrection: "M",
    },
    capability.defaultAudit,
  );
  assert.strictEqual(badKind.success, false, "an undeclared payload kind must be refused");
  if (!badKind.success) {
    assert.strictEqual(badKind.error.code, "INVALID_PAYLOAD_KIND");
  }

  const badLevel = capability.createArtefact(
    {
      payload: { kind: "text", content: "x" },
      errorCorrection: "X" as unknown as capability.ErrorCorrectionLevel,
    },
    capability.defaultAudit,
  );
  assert.strictEqual(badLevel.success, false, "an undeclared error-correction level must be refused");
  if (!badLevel.success) {
    assert.strictEqual(badLevel.error.code, "INVALID_ERROR_CORRECTION");
  }
});

test("roundtripcorrectnessproof", () => {
  const options: capability.CreationOptions = {
    payload: { kind: "text", content: "proof-body" },
    errorCorrection: "M",
  };
  const outcome = capability.createArtefact(options, capability.defaultAudit);
  assert.strictEqual(outcome.success, true, "the decode-based audit must accept a valid request");
  if (!outcome.success) return;

  // Admissible evidence: decoding the produced artefact, not the encoder's internals.
  const decoded = capability.decodeArtefact(embeddedBody(outcome.artefact));
  assert.deepStrictEqual(decoded.payload, options.payload);
  assert.strictEqual(decoded.errorCorrection, options.errorCorrection);

  const proven = capability.proveRoundTrip(options, outcome.artefact);
  assert.strictEqual(proven.success, true, "the exported proof must accept the produced artefact");

  const mismatched = capability.proveRoundTrip(
    { payload: { kind: "text", content: "different" }, errorCorrection: "M" },
    outcome.artefact,
  );
  assert.strictEqual(
    mismatched.success,
    false,
    "the proof must reject an artefact that decodes to a different payload",
  );
  if (!mismatched.success) {
    assert.strictEqual(mismatched.error.code, "ROUNDTRIP_MISMATCH");
  }

  // A forgery whose stated payload differs from what its body decodes to can
  // only be caught by decoding; the decode-based default audit must refuse it.
  const statedPayload: capability.Payload = { kind: "text", content: "stated" };
  const forgedBody = capability.encodeArtefact(
    { kind: "text", content: "tampered" },
    "M",
    undefined,
    undefined,
    undefined,
    undefined,
  );
  const forged: capability.Artefact = {
    version: capability.ARTEFACT_VERSION,
    payload: statedPayload,
    checksum: "c0::" + forgedBody,
  };
  const verdict = capability.defaultAudit({ payload: statedPayload, errorCorrection: "M" }, forged);
  assert.strictEqual(verdict.success, false, "decoding must expose the forged body");
  if (!verdict.success) {
    assert.strictEqual(verdict.error.code, "ROUNDTRIP_MISMATCH");
  }
});

test("roundtripcorrectnessvalidation", () => {
  const pairs = new Set<string>();
  let hasStyle = false;
  let hasOverlay = false;
  let hasArtwork = false;
  let hasAnimation = false;
  let hasFullyCustomised = false;
  for (const vector of capability.ROUND_TRIP_VECTORS) {
    pairs.add(`${vector.kind}/${vector.errorCorrection}`);
    if (vector.style !== undefined) hasStyle = true;
    if (vector.overlay !== undefined) hasOverlay = true;
    if (vector.artwork !== undefined) hasArtwork = true;
    if (vector.animation !== undefined) hasAnimation = true;
    if (
      vector.style !== undefined &&
      vector.overlay !== undefined &&
      vector.artwork !== undefined &&
      vector.animation !== undefined
    ) {
      hasFullyCustomised = true;
    }
  }
  for (const kind of capability.PAYLOAD_KINDS) {
    for (const level of capability.ERROR_CORRECTION_LEVELS) {
      assert.ok(
        pairs.has(`${kind}/${level}`),
        `vectors must cover payload kind "${kind}" at error-correction level "${level}"`,
      );
    }
  }
  assert.ok(hasStyle, "vectors must include styling customisation");
  assert.ok(hasOverlay, "vectors must include overlay customisation");
  assert.ok(hasArtwork, "vectors must include artwork customisation");
  assert.ok(hasAnimation, "vectors must include animation customisation");
  assert.ok(hasFullyCustomised, "vectors must include a fully customised request");

  const reports = capability.validateRoundTripVectors();
  assert.strictEqual(reports.length, capability.ROUND_TRIP_VECTORS.length);
  for (const report of reports) {
    assert.strictEqual(
      report.outcome.success,
      true,
      `vector for kind "${report.vector.kind}" at level "${report.vector.errorCorrection}" must round-trip`,
    );
  }
});