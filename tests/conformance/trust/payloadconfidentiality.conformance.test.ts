import assert from "node:assert/strict";
import test from "node:test";
import * as capability from "../../../src/capabilities/trust/payloadconfidentiality.ts";

type Artefact = { readonly kind: capability.PayloadKind; readonly sizeClass: capability.PayloadSizeClass };

test("payloadconfidentialityauditmodel", () => {
  const request: capability.PayloadRequest = {
    kind: "text",
    sizeClass: "small",
    content: "sensitive-data",
  };
  const audit = capability.auditPayload(request);
  assert.strictEqual(audit.kind, "text");
  assert.strictEqual(audit.sizeClass, "small");
  assert(!("content" in audit));
  assert(!("byteLength" in audit));
  // Audit must be a value object, not the original request.
  assert.notStrictEqual(audit, request as unknown as object);
});

test("payloadconfidentialitycontracts", () => {
  const request: capability.PayloadRequest = {
    kind: "binary",
    sizeClass: "small",
    content: Buffer.alloc(100),
  };
  const outcome = capability.processPayload(request, capability.auditPayload);
  assert.strictEqual(outcome.success, true);
  if (outcome.success) {
    const artefact = outcome.result.artefact as Artefact;
    assert.strictEqual(artefact.kind, request.kind);
    assert.strictEqual(artefact.sizeClass, request.sizeClass);
    assert(!("content" in artefact));
  }
});

test("payloadconfidentialityerrormodel", () => {
  const oversizedBuffer = Buffer.alloc(1025);
  const request: capability.PayloadRequest = {
    kind: "binary",
    sizeClass: "small",
    content: oversizedBuffer,
  };
  const outcome = capability.processPayload(request, capability.auditPayload);
  assert.strictEqual(outcome.success, false);
  if (!outcome.success) {
    const error: capability.PayloadError = outcome;
    assert.strictEqual(error.rule, "sizeBoundExceeded");
    assert(typeof error.bound === "string");
    assert(error.bound.includes("small"));
    assert(error.message.includes("exceeds"));
    assert(!("content" in error));
  }
});

test("payloadconfidentialitypermissions", () => {
  const secret = { data: "sensitive" };
  assert.doesNotThrow(() => capability.assertNoPayloadLeak(secret));
  const request: capability.PayloadRequest = {
    kind: "json",
    sizeClass: "small",
    content: secret,
  };
  const audit = capability.auditPayload(request);
  assert(!("content" in audit));
  assert(!("data" in audit));
  // Audit record must not contain nested content either.
  const serialised = JSON.stringify(audit);
  assert(!serialised.includes("sensitive"));
  assert(!serialised.includes("data"));
});

test("payloadconfidentialityvalidation", () => {
  const secret = "super-secret";
  const validRequest: capability.PayloadRequest = {
    kind: "text",
    sizeClass: "small",
    content: secret,
  };
  const validOutcome = capability.processPayload(validRequest, capability.auditPayload);
  assert.strictEqual(validOutcome.success, true);
  if (validOutcome.success) {
    const artefact = validOutcome.result.artefact as Artefact;
    assert(!("content" in artefact));
    const serialised = JSON.stringify(artefact);
    assert(!serialised.includes("super-secret"));
  }
  capability.assertNoPayloadLeak(secret);

  const oversizedRequest: capability.PayloadRequest = {
    kind: "text",
    sizeClass: "small",
    content: "x".repeat(1025),
  };
  const oversizedOutcome = capability.processPayload(oversizedRequest, capability.auditPayload);
  assert.strictEqual(oversizedOutcome.success, false);
  if (!oversizedOutcome.success) {
    const error: capability.PayloadError = oversizedOutcome;
    assert(!("content" in error));
    assert.strictEqual(error.rule, "sizeBoundExceeded");
    assert(error.message.includes("exceeds"));
    const errorSerialised = JSON.stringify(error);
    assert(!errorSerialised.includes("xxxx"));
  }
});

test("payloadconfidentiality rejects unavailable sizes without echoing content", () => {
  const circular: Record<string, unknown> = { secret: "private-payload" };
  circular.self = circular;
  const throwing = { toJSON() { throw new Error("private-payload"); } };
  for (const content of [undefined, Symbol("private-payload"), () => "private-payload", 1n, circular, throwing]) {
    const outcome = capability.processPayload(
      { kind: "json", sizeClass: "small", content }, capability.auditPayload
    );
    assert.equal(outcome.success, false);
    if (!outcome.success) {
      assert.equal(outcome.rule, "payloadSizeUnavailable");
      assert(!JSON.stringify(outcome).includes("private-payload"));
    }
  }
});

test("payloadconfidentiality measures actual content rather than a supplied byteLength", () => {
  const outcome = capability.processPayload({
    kind: "json", sizeClass: "small",
    content: { byteLength: 0, secret: "x".repeat(1025) },
  }, capability.auditPayload);
  assert.equal(outcome.success, false);
  if (!outcome.success) assert.equal(outcome.rule, "sizeBoundExceeded");
  for (const content of [new ArrayBuffer(1025), new SharedArrayBuffer(1025), new Uint8Array(1025), new DataView(new ArrayBuffer(1025))]) {
    Object.defineProperty(content, "byteLength", { value: 0 });
    const oversized = capability.processPayload(
      { kind: "binary", sizeClass: "small", content }, capability.auditPayload
    );
    assert.equal(oversized.success, false);
    if (!oversized.success) assert.equal(oversized.rule, "sizeBoundExceeded");
  }
  for (const content of [null, new ArrayBuffer(100), new SharedArrayBuffer(100), new Uint8Array(100), new DataView(new ArrayBuffer(100))]) {
    assert.equal(capability.processPayload(
      { kind: "binary", sizeClass: "small", content }, capability.auditPayload
    ).success, true);
  }
});
