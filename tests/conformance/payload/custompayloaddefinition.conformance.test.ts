import assert from "node:assert/strict";
import test from "node:test";
import * as capability from "../../../src/capabilities/payload/custompayloaddefinition.ts";

test("custompayloaddefinitioncontracts", () => {
  const value = "Hello, ANQR!";
  const result = capability.createCustomPayload(value);
  assert.ok(result.success);
  if (result.success) {
    assert.strictEqual(result.payload.value, value);
  } else {
    throw new Error("Expected success");
  }

  const encoded = capability.encodePayload(value);
  assert.strictEqual(encoded, value);
  const decoded = capability.decodePayload(encoded);
  assert.strictEqual(decoded, value);
});

test("custompayloaddefinitionerrormodel", () => {
  const maxLen = capability.MAX_PAYLOAD_LENGTH;
  const tooLong = "a".repeat(maxLen + 1);
  const longResult = capability.createCustomPayload(tooLong);
  assert.ok(!longResult.success);
  if (!longResult.success) {
    assert.strictEqual(longResult.error.code, "CAPACITY_EXCEEDED");
  } else {
    throw new Error("Expected failure");
  }

  const invalid = "test\x01";
  const invalidResult = capability.createCustomPayload(invalid);
  assert.ok(!invalidResult.success);
  if (!invalidResult.success) {
    assert.strictEqual(invalidResult.error.code, "INVALID_CHARACTER_SET");
  } else {
    throw new Error("Expected failure");
  }

  const validResult = capability.createCustomPayload("valid");
  assert.ok(validResult.success);
  if (validResult.success) {
    assert.strictEqual(validResult.payload.value, "valid");
  } else {
    throw new Error("Expected success");
  }

  const schemeResult = capability.createCustomPayload("http://example.com/path?query=1");
  assert.ok(schemeResult.success);
  if (schemeResult.success) {
    assert.strictEqual(schemeResult.payload.value, "http://example.com/path?query=1");
  } else {
    throw new Error("Expected success");
  }
});

test("custompayloaddefinitionvalidation", () => {
  const value = "ftp://user:password@example.com/path/to/file?query=value#fragment";
  const encoded = capability.encodePayload(value);
  assert.strictEqual(encoded, value);
  const decoded = capability.decodePayload(encoded);
  assert.strictEqual(decoded, value);

  const roundTripResult = capability.validateRoundTrip(value);
  assert.ok(roundTripResult.success);
  if (roundTripResult.success) {
    assert.strictEqual(roundTripResult.payload.value, value);
  } else {
    throw new Error("Expected success");
  }
});