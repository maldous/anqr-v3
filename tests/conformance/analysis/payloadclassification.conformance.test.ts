import assert from "node:assert/strict";
import test from "node:test";

import * as capability from "../../../src/capabilities/analysis/payloadclassification.ts";

type PayloadType = capability.PayloadType;

const isPayloadType = (value: string): value is PayloadType =>
  (capability.PAYLOAD_TYPES as readonly string[]).includes(value);

test("payloadclassificationcontracts", () => {
  const patterns = capability.getClassificationPatterns();
  assert.ok(patterns.length > 0);

  const declaredTypes = patterns.map((p) => p[0]);
  assert.deepEqual(
    [...declaredTypes].slice(0, declaredTypes.length - 1),
    [...capability.CONTENT_TYPES],
  );

  for (const entry of patterns) {
    const type = entry[0];
    const classifier = entry[1];
    assert.ok(isPayloadType(type), `pattern type not in PAYLOAD_TYPES: ${type}`);
    assert.equal(typeof classifier, "function");
  }

  const positives = capability.getPositiveVectors();
  assert.ok(positives.length > 0);

  for (const v of positives) {
    const result = capability.classifyPayload(v.positive);
    assert.equal(result.success, true, `positive vector failed: ${v.type}`);
    if (!result.success) {
      throw new Error("unreachable: success branch");
    }
    assert.equal(result.type, v.type, `positive vector typed wrong: ${v.type}`);
    assert.ok(
      isPayloadType(result.type),
      `result type is not in PAYLOAD_TYPES: ${result.type}`,
    );
    assert.ok(
      result.details && typeof result.details === "object",
      `details missing for: ${v.type}`,
    );
    for (const [k, val] of Object.entries(result.details)) {
      assert.equal(typeof k, "string");
      assert.equal(typeof val, "string");
    }
  }

  for (const t of capability.PAYLOAD_TYPES) {
    assert.ok(isPayloadType(t), `PAYLOAD_TYPES member not a PayloadType: ${t}`);
  }

  const unknownPayload = "\u0001\u0002\u0003not-a-known-format\u0004\u0005";
  const unknownResult = capability.classifyPayload(unknownPayload);
  assert.equal(unknownResult.success, true);
  if (!unknownResult.success) {
    throw new Error("unreachable: success branch");
  }
  assert.equal(unknownResult.type, "unknown");
  assert.ok(
    unknownResult.details && typeof unknownResult.details === "object",
    "unknown details missing",
  );
  for (const [k, v] of Object.entries(unknownResult.details)) {
    assert.equal(typeof k, "string");
    assert.equal(typeof v, "string");
  }
});

test("payloadclassificationerrormodel", () => {
  const notAString = capability.classifyPayload(12345 as unknown);
  assert.equal(notAString.success, false);
  if (notAString.success) {
    throw new Error("unreachable: error branch");
  }
  assert.equal(notAString.error, capability.ERROR_INVALID_INPUT);
  assert.ok(
    !notAString.message.includes("12345"),
    "error message must not echo the supplied value",
  );

  const obj: Readonly<Record<string, string>> = { secret: "do-not-echo" };
  const objectResult = capability.classifyPayload(obj);
  assert.equal(objectResult.success, false);
  if (objectResult.success) {
    throw new Error("unreachable: error branch");
  }
  assert.equal(objectResult.error, capability.ERROR_INVALID_INPUT);
  assert.ok(
    !objectResult.message.includes("do-not-echo"),
    "error message must not echo the supplied value",
  );

  const longValue = "a".repeat(9000);
  const exceeds = capability.classifyPayload(longValue, 128);
  assert.equal(exceeds.success, false);
  if (exceeds.success) {
    throw new Error("unreachable: error branch");
  }
  assert.equal(exceeds.error, capability.ERROR_EXCEEDS_BOUND);
  assert.ok(
    !exceeds.message.includes("aaaaaaaaa"),
    "error message must not echo the supplied value",
  );

  const directValidation = capability.validatePayloadInput(42 as unknown);
  assert.equal(directValidation.valid, false);
  if (directValidation.valid) {
    throw new Error("unreachable: invalid branch");
  }
  assert.equal(directValidation.error.error, capability.ERROR_INVALID_INPUT);
  assert.ok(
    !directValidation.error.message.includes("42"),
    "validation error message must not echo the supplied value",
  );

  const longValidation = capability.validatePayloadInput(
    "a".repeat(9000),
    128,
  );
  assert.equal(longValidation.valid, false);
  if (longValidation.valid) {
    throw new Error("unreachable: invalid branch");
  }
  assert.equal(longValidation.error.error, capability.ERROR_EXCEEDS_BOUND);
  assert.ok(
    !longValidation.error.message.includes("aaaaaaaaa"),
    "validation error message must not echo the supplied value",
  );

  const badBound = capability.validatePayloadInput("hi", Number.NaN);
  assert.equal(badBound.valid, false);
  if (badBound.valid) {
    throw new Error("unreachable: invalid branch");
  }
  assert.equal(badBound.error.error, capability.ERROR_INVALID_INPUT);

  const negativeBound = capability.validatePayloadInput("hi", -1);
  assert.equal(negativeBound.valid, false);
  if (negativeBound.valid) {
    throw new Error("unreachable: invalid branch");
  }
  assert.equal(negativeBound.error.error, capability.ERROR_INVALID_INPUT);

  const unrecognised = capability.classifyPayload("\u0007\u0008???\u0009");
  assert.equal(unrecognised.success, true);
  if (!unrecognised.success) {
    throw new Error("unreachable: success branch");
  }
  assert.equal(unrecognised.type, "unknown");
  assert.ok(
    unrecognised.details && typeof unrecognised.details === "object",
    "unrecognised details missing",
  );

  const emptyResult = capability.classifyPayload("");
  assert.equal(emptyResult.success, true);
  if (!emptyResult.success) {
    throw new Error("unreachable: success branch");
  }
  assert.equal(emptyResult.type, "unknown");
});

test("payloadclassificationproof", () => {
  const proof = capability.readDecodedPayloadContract((v) => v);
  assert.equal(proof.proven, true);
  if (!proof.proven) {
    throw new Error("unreachable: proven branch");
  }
  const observed = proof.validation.observed;
  assert.equal(proof.validation.valid, true);
  assert.equal(proof.validation.capability, "payloadclassification");
  assert.equal(proof.validation.domain, "analysis");
  assert.equal(proof.validation.contractId, "anqr.decoded-payload.contract");
  assert.ok(observed.length > 0);

  for (const t of capability.PAYLOAD_TYPES) {
    const observation = observed.find((o) => o.type === t);
    assert.ok(observation, `missing observation for: ${t}`);
    if (!observation) {
      throw new Error("unreachable: observation present");
    }
  }

  const notProven = capability.readDecodedPayloadContract(
    (v) => ({ ...v, valid: false }),
  );
  assert.equal(notProven.proven, false);
  if (notProven.proven) {
    throw new Error("unreachable: not-proven branch");
  }
  assert.equal(notProven.error, capability.ERROR_AUDIT_FAILED);

  const stamped = capability.stampClassificationAudit(
    { kind: "test" } as const,
    capability.auditClassificationContracts,
  );
  assert.equal((stamped as { success?: boolean }).success, undefined);
  const stampedRecord = (stamped as Readonly<Record<string, unknown>>)[
    "classificationAudit"
  ] as Readonly<Record<string, unknown>>;
  assert.equal(stampedRecord["passes"], true);
  assert.equal(typeof stampedRecord["auditedCount"], "number");

  const stampedFailed = capability.stampClassificationAudit(
    { kind: "test" } as const,
    () => ({
      passes: false,
      auditedCount: 0,
      mismatches: [{ type: "url" as PayloadType, reason: "forced" }],
    }),
  );
  assert.equal((stampedFailed as { success?: boolean }).success, false);
  assert.equal(
    (stampedFailed as { error?: string }).error,
    capability.ERROR_AUDIT_FAILED,
  );

  const stampedThrew = capability.stampClassificationAudit(
    { kind: "test" } as const,
    () => {
      throw new Error("boom");
    },
  );
  assert.equal((stampedThrew as { success?: boolean }).success, false);
  assert.equal(
    (stampedThrew as { error?: string }).error,
    capability.ERROR_AUDIT_FAILED,
  );
});

test("payloadclassificationstatemodel", () => {
  const patterns = capability.getClassificationPatterns();
  assert.ok(patterns.length > 0);

  const declaredOrder: readonly PayloadType[] = capability.PRECEDENCE_ORDER;
  assert.deepEqual(
    [...declaredOrder],
    patterns.map((p) => p[0]),
  );

  for (const t of capability.PAYLOAD_TYPES) {
    assert.ok(
      declaredOrder.includes(t),
      `declared type missing from precedence: ${t}`,
    );
  }

  const samples: ReadonlyArray<readonly [string, PayloadType]> = [
    ["https://example.com/path?x=1", "url"],
    ["WIFI:T:WPA;S:Home;P:pwd;;", "wifi"],
    ["bitcoin:1BoatSLRHtKNngkdXEeobR76b53LETtpyT?amount=0.1", "crypto_bitcoin"],
  ];
  for (const [payload, expected] of samples) {
    assert.equal(
      capability.isClassificationDeterministic(payload, 5),
      true,
      `non-deterministic: ${payload}`,
    );
    const first = capability.classifyPayload(payload);
    const second = capability.classifyPayload(payload);
    const third = capability.classifyPayload(payload);
    if (!first.success || !second.success || !third.success) {
      throw new Error("unreachable: success branches");
    }
    assert.equal(first.type, expected);
    assert.equal(second.type, expected);
    assert.equal(third.type, expected);
  }

  const ambiguous = capability.classifyPayload("MECARD:foo@bar.com");
  assert.equal(ambiguous.success, true);
  if (!ambiguous.success) {
    throw new Error("unreachable: success branch");
  }
  assert.equal(ambiguous.type, "mecard");

  const vcardish = capability.classifyPayload(
    "BEGIN:VCARD\nEMAIL:x@y.zz\nEND:VCARD",
  );
  assert.equal(vcardish.success, true);
  if (!vcardish.success) {
    throw new Error("unreachable: success branch");
  }
  assert.equal(vcardish.type, "vcard");

  const wifiOverUrl = capability.classifyPayload(
    "WIFI:T:WPA;S:https://x.example;;",
  );
  assert.equal(wifiOverUrl.success, true);
  if (!wifiOverUrl.success) {
    throw new Error("unreachable: success branch");
  }
  assert.equal(wifiOverUrl.type, "wifi");

  const bitcoinOverEthereum = capability.classifyPayload(
    "bitcoin:0xabc1234567890abcdef1234567890abcdef1234",
  );
  assert.equal(bitcoinOverEthereum.success, true);
  if (!bitcoinOverEthereum.success) {
    throw new Error("unreachable: success branch");
  }
  assert.equal(bitcoinOverEthereum.type, "crypto_bitcoin");

  const audit = capability.auditClassificationContracts();
  assert.equal(
    audit.passes,
    true,
    `audit failed: ${JSON.stringify(audit.mismatches)}`,
  );
  assert.equal(audit.auditedCount, capability.PAYLOAD_TYPES.length);
  assert.equal(audit.mismatches.length, 0);
});

test("payloadclassificationvalidation", () => {
  const positives = capability.getPositiveVectors();
  const nearMisses = capability.getNearMissVectors();
  assert.equal(positives.length, capability.PAYLOAD_TYPES.length);
  assert.equal(nearMisses.length, capability.PAYLOAD_TYPES.length);

  for (const t of capability.PAYLOAD_TYPES) {
    const pos = positives.find((v) => v.type === t);
    const nm = nearMisses.find((v) => v.type === t);
    assert.ok(pos, `missing positive vector for: ${t}`);
    assert.ok(nm, `missing near-miss vector for: ${t}`);
    if (!pos || !nm) {
      throw new Error("unreachable: vectors present");
    }
    assert.ok(pos.positive.length > 0, `empty positive vector for: ${t}`);
  }

  for (const v of positives) {
    const a = capability.classifyPayload(v.positive);
    const b = capability.classifyPayload(v.positive);
    const c = capability.classifyPayload(v.positive);
    assert.equal(a.success, true, `positive vector failed: ${v.type}`);
    assert.equal(b.success, true);
    assert.equal(c.success, true);
    if (!a.success || !b.success || !c.success) {
      throw new Error("unreachable: success branches");
    }
    assert.equal(a.type, v.type, `positive vector typed wrong: ${v.type}`);
    assert.equal(b.type, v.type);
    assert.equal(c.type, v.type);
  }

  const auditRecord = capability.auditClassificationContracts();
  assert.equal(
    auditRecord.passes,
    true,
    `contract audit failed: ${JSON.stringify(auditRecord.mismatches)}`,
  );
  assert.equal(auditRecord.auditedCount, capability.PAYLOAD_TYPES.length);
  assert.equal(auditRecord.mismatches.length, 0);

  for (const v of positives) {
    assert.equal(
      capability.isClassificationDeterministic(v.positive, 5),
      true,
      `non-deterministic classification: ${v.type}`,
    );
  }

  assert.equal(capability.isClassificationDeterministic(42 as unknown, 3), true);
  assert.equal(
    capability.isClassificationDeterministic("a".repeat(9000), 3, 128),
    true,
  );

  assert.equal(capability.isClassificationDeterministic("hello", 0), false);

  assert.equal(
    capability.isClassificationDeterministic("https://example.com", 1),
    true,
  );
});