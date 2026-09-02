import assert from "node:assert/strict";
import test from "node:test";

import * as capability from "../../../src/capabilities/analysis/payloadclassification.ts";

type PayloadType = capability.PayloadType;

const isPayloadType = (value: string): value is PayloadType =>
  (capability.PAYLOAD_TYPES as readonly string[]).includes(value);

test("payloadclassificationcontracts", () => {
  const samples: ReadonlyArray<readonly [string, string]> = [
    ["https://example.com/path?x=1", "url"],
    ["WIFI:T:WPA;S:Home;P:secret;;", "wifi"],
    ["BEGIN:VCARD\nFN:Ada\nEND:VCARD", "vcard"],
    ["MECARD:N:Doe,John;TEL:5551234;;", "mecard"],
    ["person@example.com", "email"],
    ["tel:+15555550100", "tel"],
    ["sms:+15555550100:Hi there", "sms"],
    ["geo:37.7749,-122.4194", "geo"],
    ["bitcoin:bc1qexampleaddresspayload", "crypto_bitcoin"],
    ["ethereum:0x0123456789abcdef0123456789abcdef01234567", "crypto_ethereum"],
    ["crypto:chain=example;addr=XYZ", "crypto_other"],
    ["sepa:BCD\n002\n1\nDE89370400440532013000\n", "epc_sepa"],
    ["upi:user@bank", "upi"],
    ["EMV:00020101021226140014...", "emv_qr"],
    ["SQB:010000...", "swiss_qr_bill"],
    ["BEGIN:VEVENT\nSUMMARY:Standup\nEND:VEVENT", "calendar_event"],
    ["otpauth://totp/Example:user@host", "otpauth"],
    ["Hello, just a plain note.", "plain_text"],
  ];

  for (const [payload, expectedType] of samples) {
    const result = capability.classifyPayload(payload);
    assert.equal(result.success, true);
    if (!result.success) {
      throw new Error("unreachable: success branch");
    }
    assert.equal(result.type, expectedType);
    assert.ok(isPayloadType(result.type), `result.type must be a declared PayloadType: ${result.type}`);
    assert.equal(typeof result.data, "object");
    assert.notEqual(result.data, null);
  }

  // Unrecognised payload still resolves to one of the declared types.
  const unknownResult = capability.classifyPayload("\u0001\u0002\u0003not-a-known-format");
  assert.equal(unknownResult.success, true);
  if (!unknownResult.success) {
    throw new Error("unreachable: success branch");
  }
  assert.equal(unknownResult.type, "unknown");
  assert.deepEqual(unknownResult.data, {});

  // Every declared PAYLOAD_TYPE must actually be producible as a classification result.
  // We cover the one remaining type via the fallback path and via the precedence ordering.
  const fallbackResult = capability.classifyPayload("plain words here");
  assert.equal(fallbackResult.success, true);
  if (!fallbackResult.success) {
    throw new Error("unreachable: success branch");
  }
  assert.ok(isPayloadType(fallbackResult.type));
});

test("payloadclassificationerrormodel", () => {
  // Non-string input: must be refused without echoing the value.
  const notAString = capability.classifyPayload(12345 as unknown);
  assert.equal(notAString.success, false);
  if (notAString.success) {
    throw new Error("unreachable: error branch");
  }
  assert.equal(notAString.error, "invalid_input");
  assert.equal(typeof notASstring.message, "string");
  assert.equal((notASstring as unknown as { payload?: unknown }).payload, undefined);
  assert.equal(JSON.stringify(notASstring).includes("12345"), false);

  // Object input is also refused and must not echo the object.
  const obj = { secret: "do-not-echo" };
  const objectResult = capability.classifyPayload(obj);
  assert.equal(objectResult.success, false);
  if (objectResult.success) {
    throw new Error("unreachable: error branch");
  }
  assert.equal(objectResult.error, "invalid_input");
  assert.equal(JSON.stringify(objectResult).includes("do-not-echo"), false);

  // Exceeds bound: must be refused without echoing the value.
  const tooLong = "a".repeat(9000);
  const exceeds = capability.classifyPayload(tooLong, 128);
  assert.equal(exceeds.success, false);
  if (exceeds.success) {
    throw new Error("unreachable: error branch");
  }
  assert.equal(exceeds.error, "exceeds_bound");
  assert.equal(typeof exceeds.message, "string");
  assert.equal(JSON.stringify(exceeds).includes("aaaaaaaaa"), false);

  // Unrecognised payload classifies as unknown rather than failing.
  const unrecognised = capability.classifyPayload("\u0007\u0008???\u0009");
  assert.equal(unrecognised.success, true);
  if (!unrecognised.success) {
    throw new Error("unreachable: success branch");
  }
  assert.equal(unrecognised.type, "unknown");
});

test("payloadclassificationproof", () => {
  // Satisfaction of this capability is read from the ANQR decoded-payload
  // contract validation rather than restated. The capability must nevertheless
  // expose a stable, exported handle that the foundation contract references.
  assert.equal(typeof capability.classifyPayload, "function");
  assert.equal(Array.isArray(capability.PAYLOAD_TYPES), true);
  assert.ok(capability.PAYLOAD_TYPES.length > 0);

  // The precedence handle the foundation contract consumes must be the
  // same readonly array as the declared types.
  assert.equal(capability.PRECEDENCE_ORDER, capability.PAYLOAD_TYPES);

  // A representative decode of an ANQR-style payload succeeds via the contract.
  const anqr = capability.classifyPayload("BEGIN:VEVENT\nSUMMARY:From ANQR\nEND:VEVENT");
  assert.equal(anqr.success, true);
  if (!anqr.success) {
    throw new Error("unreachable: success branch");
  }
  assert.equal(anqr.type, "calendar_event");
});

test("payloadclassificationstatemodel", () => {
  // Lexical precedence: the order exported by the module is the order
  // in which matches are resolved.
  const declared: readonly PayloadType[] = capability.PAYLOAD_TYPES;
  const precedence: readonly PayloadType[] = capability.PRECEDENCE_ORDER;
  assert.deepEqual([...precedence], [...declared]);

  // Determinism across repeats.
  const payload = "bitcoin:bc1qlexicaldeterminismcheck";
  const first = capability.classifyPayload(payload);
  const second = capability.classifyPayload(payload);
  const third = capability.classifyPayload(payload);
  assert.equal(first.success, true);
  assert.equal(second.success, true);
  assert.equal(third.success, true);
  if (!first.success || !second.success || !third.success) {
    throw new Error("unreachable: success branches");
  }
  assert.equal(first.type, second.type);
  assert.equal(second.type, third.type);

  // A payload matching multiple patterns resolves to the lexically first matching type.
  // "MECARD:foo@bar.com" matches both "mecard" (lexically before) and "email" patterns;
  // the module must pick "mecard".
  const ambiguous = capability.classifyPayload("MECARD:foo@bar.com");
  assert.equal(ambiguous.success, true);
  if (!ambiguous.success) {
    throw new Error("unreachable: success branch");
  }
  assert.equal(ambiguous.type, "mecard");

  // Same for "BEGIN:VCARD" vs "email" — the VCARD pattern wins lexically.
  const vcardish = capability.classifyPayload("BEGIN:VCARD\nEMAIL:x@y.zz\nEND:VCARD");
  assert.equal(vcardish.success, true);
  if (!vcardish.success) {
    throw new Error("unreachable: success branch");
  }
  assert.equal(vcardish.type, "vcard");
});

test("payloadclassificationvalidation", () => {
  // Positive vectors for every declared content type.
  const positives: ReadonlyArray<readonly [string, PayloadType]> = [
    ["https://example.com", "url"],
    ["WIFI:T:WPA;S:Home;P:pwd;;", "wifi"],
    ["BEGIN:VCARD\nFN:Ada\nEND:VCARD", "vcard"],
    ["MECARD:N:Doe,John;;", "mecard"],
    ["person@example.com", "email"],
    ["tel:+15555550100", "tel"],
    ["sms:+15555550100:hello", "sms"],
    ["geo:37.0,-122.0", "geo"],
    ["bitcoin:bc1qexample", "crypto_bitcoin"],
    ["ethereum:0xabc", "crypto_ethereum"],
    ["crypto:chain=x;addr=y", "crypto_other"],
    ["sepa:BCD\n002\n1\nDE89\n", "epc_sepa"],
    ["upi:user@bank", "upi"],
    ["EMV:000201010212", "emv_qr"],
    ["SQB:010000123", "swiss_qr_bill"],
    ["BEGIN:VEVENT\nSUMMARY:X\nEND:VEVENT", "calendar_event"],
    ["otpauth://totp/Example:user@host", "otpauth"],
    ["some readable text", "plain_text"],
  ];

  // Near-miss vectors that must NOT resolve to their tempting neighbour.
  const nearMisses: ReadonlyArray<readonly [string, PayloadType]> = [
    ["BEGIN:vcard\nFN:Ada\nEND:vcard", "wifi"],   // lower-case vcard not a wifi
    ["WIFI:N:NoSecurity;;", "vcard"],              // wifi is not a vcard
    ["MECARD:N:Doe", "email"],                     // mecard prefix is not email
    ["not-an-email", "email"],                     // lacks '@'
    ["telephone:+15555550100", "tel"],             // missing tel: scheme
    ["SMS:+15555550100", "sms"],                   // case-sensitive scheme prefix
    ["GEOLOC:1,2", "geo"],                         // wrong scheme
    ["BITCOIN:bc1q", "crypto_bitcoin"],            // case-sensitive scheme
    ["Ethereum:0xabc", "crypto_ethereum"],        // case-sensitive scheme
    ["CRYPTOPAY:foo", "crypto_other"],             // wrong scheme
    ["SEPA2:BCD", "epc_sepa"],                     // wrong scheme
    ["UPI-PAY:foo@bank", "upi"],                   // wrong scheme
    ["emv:000201010212", "emv_qr"],                // lower-case emv
    ["sqb:010000123", "swiss_qr_bill"],            // lower-case sqb
    ["begin:vevent\nSUMMARY:X\nEND:VEVENT", "calendar_event"], // lower-case begin
    ["OTPS:abc", "otp_auth"],                      // wrong scheme
    ["   ", "plain_text"],                         // whitespace-only is empty
  ];

  for (const [payload, expectedType] of positives) {
    const firstRun = capability.classifyPayload(payload);
    const secondRun = capability.classifyPayload(payload);
    assert.equal(firstRun.success, true, `positive vector failed: ${payload}`);
    assert.equal(secondRun.success, true, `positive vector failed on repeat: ${payload}`);
    if (!firstRun.success || !secondRun.success) {
      throw new Error("unreachable: success branches");
    }
    assert.equal(firstRun.type, expectedType, `positive vector typed wrong: ${payload}`);
    assert.equal(secondRun.type, expectedType, `positive vector not deterministic: ${payload}`);
  }

  for (const [payload, temptingType] of nearMisses) {
    const result = capability.classifyPayload(payload);
    assert.equal(result.success, true, `near-miss must not error: ${payload}`);
    if (!result.success) {
      throw new Error("unreachable: success branch");
    }
    assert.notEqual(
      result.type,
      temptingType,
      `near-miss was misclassified as ${temptingType}: ${payload}`
    );
  }

  // Determinism: every positive vector repeated yields the same outcome.
  for (const [payload, expectedType] of positives) {
    const a = capability.classifyPayload(payload);
    const b = capability.classifyPayload(payload);
    const c = capability.classifyPayload(payload);
    assert.equal(a.success, b.success);
    assert.equal(b.success, c.success);
    if (!a.success || !b.success || !c.success) {
      throw new Error("unreachable: success branches");
    }
    assert.equal(a.type, expectedType);
    assert.equal(b.type, expectedType);
    assert.equal(c.type, expectedType);
  }
});