import assert from "node:assert/strict";
import test from "node:test";

import * as capability from "../../../src/capabilities/analysis/payloadclassification.ts";

type PayloadType = capability.PayloadType;

test("payloadclassificationcontracts", () => {
  const patterns = capability.getClassificationPatterns();
  assert.ok(patterns.length > 0);

  for (const entry of patterns) {
    const type = entry[0];
    const classifier = entry[1];
    assert.equal(typeof classifier, "function");
    assert.ok(capability.PAYLOAD_TYPES.includes(type));
  }

  for (const t of capability.PAYLOAD_TYPES) {
    assert.ok(capability.PAYLOAD_TYPES.includes(t));
  }

  for (const t of capability.CONTENT_TYPES) {
    assert.notEqual(t, "unknown");
  }

  const testCases: ReadonlyArray<[string, PayloadType]> = [
    ["WIFI:T:WPA;S:mynet;P:secret;;", "wifi"],
    ["BEGIN:VCARD\nFN:Ada\nEND:VCARD", "vcard"],
    ["MECARD:N:Doe,Ada;TEL:123;;", "mecard"],
    ["ada@example.com", "email"],
    ["tel:+15551234567", "tel"],
    ["sms:+15551234567:Hi", "sms"],
    ["geo:37.786971,-122.399677", "geo"],
    ["bitcoin:1BoatSLRHtKNngkdXEeobR76b53LETtpyT?amount=0.1", "crypto_bitcoin"],
    ["ethereum:0xabc1234567890abcdef1234567890abcdef1234", "crypto_ethereum"],
    ["crypto:dogecoin:ABC123", "crypto_other"],
    ["BCD\n002\n1\nSCT\n", "epc_sepa"],
    ["upi://pay?pa=alice@bank&am=10", "upi"],
    ["000201010212", "emv_qr"],
    ["SPC\n0100\n", "swiss_qr_bill"],
    ["BEGIN:VEVENT\nSUMMARY:Meet\nEND:VEVENT", "calendar_event"],
    ["otpauth://totp/Example:alice?secret=JBSWY3DPEHPK3PXP", "otp_auth"],
    ["https://example.com/path?x=1", "url"],
  ];

  for (const [payload, expectedType] of testCases) {
    const result = capability.classifyPayload(payload);
    assert.equal(result.success, true, `failed to classify: ${payload}`);
    if (!result.success) throw new Error("unreachable");
    assert.equal(result.type, expectedType, `wrong type for: ${payload}`);
    assert.ok(result.details && typeof result.details === "object");
    for (const [k, v] of Object.entries(result.details)) {
      assert.equal(typeof k, "string");
      assert.equal(typeof v, "string");
    }
  }
});

test("payloadclassificationerrormodel", () => {
  const notAString = capability.classifyPayload(12345 as unknown);
  assert.equal(notAString.success, false);
  if (notAString.success) throw new Error("unreachable");
  assert.equal(notAString.error, "invalid_input");
  assert.ok(!notAString.message.includes("12345"));

  const obj: Readonly<Record<string, string>> = { secret: "do-not-echo" };
  const objectResult = capability.classifyPayload(obj);
  assert.equal(objectResult.success, false);
  if (objectResult.success) throw new Error("unreachable");
  assert.equal(objectResult.error, "invalid_input");
  assert.ok(!objectResult.message.includes("do-not-echo"));

  const longValue = "a".repeat(9000);
  const exceeds = capability.classifyPayload(longValue, 128);
  assert.equal(exceeds.success, false);
  if (exceeds.success) throw new Error("unreachable");
  assert.equal(exceeds.error, "exceeds_bound");
  assert.ok(!exceeds.message.includes("aaa"));

  const directValidation = capability.validatePayloadInput(42 as unknown);
  assert.equal(directValidation.valid, false);
  if (directValidation.valid) throw new Error("unreachable");
  assert.equal(directValidation.error.error, "invalid_input");

  const unrecognised = capability.classifyPayload("##deliberately-unmatched##");
  assert.equal(unrecognised.success, true);
  if (!unrecognised.success) throw new Error("unreachable");
  assert.ok(capability.PAYLOAD_TYPES.includes(unrecognised.type));
});

test("payloadclassificationproof", () => {
  const proof = capability.readDecodedPayloadContract((v) => v);
  assert.equal(proof.proven, true);
  if (!proof.proven) throw new Error("unreachable");

  const validation = proof.validation;
  assert.equal(validation.valid, true);
  assert.equal(validation.capability, "payloadclassification");
  assert.equal(validation.domain, "analysis");
  assert.equal(validation.contractId, "anqr.decoded-payload.contract");

  const wrongContract = capability.readDecodedPayloadContract((v) => ({
    ...v,
    contractId: "other.contract",
  }));
  assert.equal(wrongContract.proven, false);

  const stamped = capability.stampClassificationAudit(
    { kind: "test" },
    capability.classifyPayload,
  );
  assert.equal(stamped.success, true);
});

test("payloadclassificationstatemodel", () => {
  const patterns = capability.getClassificationPatterns();
  assert.ok(patterns.length > 0);

  const declaredOrder: readonly PayloadType[] = capability.PRECEDENCE_ORDER;
  assert.equal(declaredOrder.length, patterns.length);

  for (let i = 0; i < declaredOrder.length; i++) {
    const expectedType = declaredOrder[i];
    const patternType = patterns[i]?.[0];
    assert.equal(expectedType, patternType);
  }

  for (const t of capability.PAYLOAD_TYPES) {
    assert.ok(declaredOrder.includes(t));
  }

  const samples: ReadonlyArray<readonly [string, PayloadType]> = [
    ["WIFI:T:WPA;S:Home;P:pwd;;", "wifi"],
    ["bitcoin:1BoatSLRHtKNngkdXEeobR76b53LETtpyT?amount=0.1", "crypto_bitcoin"],
    ["tel:+15551234567", "tel"],
  ];

  for (const [payload, expected] of samples) {
    const first = capability.classifyPayload(payload);
    const second = capability.classifyPayload(payload);
    const third = capability.classifyPayload(payload);
    if (!first.success || !second.success || !third.success) {
      throw new Error("unreachable");
    }
    assert.equal(first.type, expected);
    assert.equal(second.type, expected);
    assert.equal(third.type, expected);
    assert.equal(capability.isClassificationDeterministic(payload, 5), true);
  }
});

test("payloadclassificationvalidation", () => {
  const positives = capability.getPositiveVectors();
  const nearMisses = capability.getNearMissVectors();
  assert.ok(positives.length > 0);
  assert.ok(nearMisses.length > 0);

  for (const v of positives) {
    assert.ok(v.positive.length > 0);
  }

  for (const v of positives) {
    assert.equal(capability.isClassificationDeterministic(v.positive, 5), true);
  }

  assert.equal(capability.isDeterministicAcrossVectors(3), true);

  const auditRecord = capability.auditClassificationContracts();
  assert.equal(
    auditRecord.passes,
    true,
    `contract audit failed: ${JSON.stringify(auditRecord.mismatches)}`,
  );
  assert.ok(auditRecord.auditedCount >= positives.length);

  const positiveReport = capability.validatePositiveVectors();
  for (const entry of positiveReport) {
    assert.equal(entry.matches, true, `positive mismatch: ${entry.type}`);
  }

  const nearMissReport = capability.validateNearMissVectors();
  for (const entry of nearMissReport) {
    assert.equal(entry.rejected, true, `near-miss not rejected: ${entry.type}`);
  }
});