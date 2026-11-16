import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createArtefact,
  encodeArtefact,
  proveRoundTrip,
  type Artefact,
  type CreationOptions,
} from "../../../src/capabilities/quality/roundtripcorrectness.ts";

function body(options: CreationOptions): string {
  return encodeArtefact(
    options.payload, options.errorCorrection, options.style,
    options.overlay, options.artwork, options.animation,
  );
}

function bare(): CreationOptions {
  return { payload: { kind: "text", content: "roundtrip contract" }, errorCorrection: "M" };
}

function full(): CreationOptions {
  return {
    payload: { kind: "text", content: "roundtrip contract", metadata: { source: "contract" } },
    errorCorrection: "H",
    style: { foreground: "#112233", background: "#FFFFFF", eyeShape: "circle", moduleShape: "rounded" },
    overlay: { logo: { data: "LOGO", size: 64 }, frame: { label: "SCAN", color: "#FF0000" } },
    artwork: { eyeColor: "#111111", dataColor: "#222222", timingPattern: "solid" },
    animation: { enabled: true, speed: "normal" },
  };
}

function candidate(options: CreationOptions, encoded = body(options)): Artefact {
  return { version: 1, payload: options.payload, checksum: "unverified::" + encoded };
}

function assertMismatch(options: CreationOptions, artefact: Artefact): void {
  const outcome = proveRoundTrip(options, artefact);
  assert.equal(outcome.success, false);
  if (outcome.success) throw new Error("Expected a round-trip mismatch");
  assert.equal(outcome.error.code, "ROUNDTRIP_MISMATCH");
  assert.equal(outcome.error.role, "alert");
  assert.ok(outcome.error.message.length > 0);
}

test("roundtrip_proof_accepts_all_ecc_with_metadata_and_customisations", () => {
  for (const errorCorrection of ["L", "M", "Q", "H"] as const) {
    const options = { ...full(), errorCorrection };
    const outcome = createArtefact(options, proveRoundTrip);
    assert.equal(outcome.success, true, errorCorrection);
    if (!outcome.success) throw new Error("Expected creation through the public proof audit");
    assert.deepEqual(proveRoundTrip(options, outcome.artefact), { success: true });
  }
});

test("roundtrip_proof_refuses_missing_embedded_body", () => {
  const options = bare();
  assertMismatch(options, { version: 1, payload: options.payload, checksum: "c0" });
});

test("roundtrip_proof_refuses_malformed_embedded_body", () => {
  const options = bare();
  assertMismatch(options, candidate(options, "not-an-artefact"));
});

test("roundtrip_proof_compares_every_embedded_request_facet", () => {
  const options = bare();
  const extras = full();
  const different: CreationOptions[] = [
    { ...options, payload: { ...options.payload, content: "different" } },
    { ...options, payload: { ...options.payload, kind: "url" } },
    { ...options, payload: { ...options.payload, metadata: { source: "different" } } },
    { ...options, errorCorrection: "H" },
    { ...options, style: extras.style },
    { ...options, overlay: extras.overlay },
    { ...options, artwork: extras.artwork },
    { ...options, animation: extras.animation },
  ];
  for (const other of different) {
    assertMismatch(options, candidate(options, body(other)));
  }
});

test("roundtrip_proof_reads_body_instead_of_payload_shadow", () => {
  const options = full();
  const artefact = {
    ...candidate(options),
    payload: { kind: "url", content: "shadow is not the encoded body" } as const,
  };
  assert.deepEqual(proveRoundTrip(options, artefact), { success: true });
});

test("roundtrip_proof_preserves_noncryptographic_canonical_audit_limits", () => {
  const options = bare();
  const artefact = { ...candidate(options), version: 999 };
  // The canonical audit compares the body; version and the prefix are not authenticated.
  assert.deepEqual(proveRoundTrip(options, artefact), { success: true });
});
