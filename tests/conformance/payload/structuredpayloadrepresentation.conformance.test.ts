import assert from "node:assert/strict";
import test from "node:test";

import * as capability from "../../../src/capabilities/payload/structuredpayloadrepresentation.ts";

test("structuredpayloadrepresentationcontracts", () => {
  const declared = capability.PAYLOAD_KINDS;
  const required: capability.PayloadKind[] = [
    "plain_text",
    "url",
    "tel",
    "email",
    "sms",
    "geo",
    "vcard",
    "mecard",
    "bizcard",
    "wifi",
    "app_link",
    "event",
    "event_rsvp",
    "calendar_subscription",
    "social_profile",
    "messaging_link",
    "short_link",
    "utm_link",
    "custom",
    "payment",
    "product_identity",
  ];
  for (const kind of required) {
    assert.ok(
      (declared as readonly string[]).includes(kind),
      `PAYLOAD_KINDS must include ${kind}`,
    );
    const schema = capability.getPayloadSchema(kind);
    assert.equal(schema.kind, kind);
    assert.ok(schema.fields.length > 0, `${kind} must declare at least one field`);
  }
});

test("structuredpayloadrepresentationerrormodel", () => {
  const missing = capability.validatePayload(
    capability.createEmptyPayload("url"),
  );
  assert.equal(missing.success, false);
  if (missing.success) return;
  assert.equal(missing.error.kind, "field_error");
  assert.equal(missing.error.field, "url");
  assert.ok(
    missing.error.reason.includes("url"),
    "missing-field reason must name the field",
  );
  assert.ok(
    !missing.error.reason.includes("https://"),
    "missing-field reason must not echo any value",
  );

  const malformed = capability.validatePayload({
    kind: "url",
    values: { url: "not-a-url" },
  });
  assert.equal(malformed.success, false);
  if (malformed.success) return;
  assert.equal(malformed.error.kind, "format_error");
  assert.equal(malformed.error.field, "url");
  assert.ok(
    !malformed.error.reason.includes("not-a-url"),
    "format_error reason must not echo the supplied value back",
  );
});

test("structuredpayloadrepresentationstatemodel", () => {
  const presentation: capability.PresentationOptions =
    capability.createPresentation("#111111", "#eeeeee", "large", "H");
  const state = capability.createPayloadState(
    presentation,
    capability.createEmptyPayload("plain_text"),
  );

  const switched = capability.selectKind(state, "wifi");
  assert.equal(switched.success, true);
  if (!switched.success) return;
  assert.deepEqual(switched.state.presentation, presentation);
  assert.equal(switched.state.payload.kind, "wifi");

  const recoloured = capability.withPresentation(
    switched.state,
    (p) => ({
      ...p,
      foregroundColor: "#222222",
      backgroundColor: "#dddddd",
    }),
  );
  assert.deepEqual(recoloured.presentation, {
    ...presentation,
    foregroundColor: "#222222",
    backgroundColor: "#dddddd",
  });
  assert.equal(recoloured.payload.kind, "wifi");
  assert.deepEqual(recoloured.payload.values, {});
});

test("structuredpayloadrepresentationuisemantics", () => {
  const wifiFields = capability.getFieldsForKind("wifi");
  const wifiNames = new Set(wifiFields.map((f) => f.name));
  assert.ok(wifiNames.has("ssid"));
  assert.ok(wifiNames.has("password"));
  assert.ok(wifiNames.has("security"));
  assert.ok(wifiNames.has("hidden"));
  assert.ok(!wifiNames.has("url"), "wifi must not expose a url field");
  assert.ok(!wifiNames.has("address"), "wifi must not expose an address field");

  const urlFields = capability.getFieldsForKind("url");
  const urlNames = new Set(urlFields.map((f) => f.name));
  assert.deepEqual([...urlNames], ["url"]);
  assert.ok(!urlNames.has("ssid"), "url must not expose a wifi field");

  const declared = new Set(capability.PAYLOAD_KINDS);
  for (const kind of declared) {
    const fields = capability.getFieldsForKind(kind);
    for (const field of fields) {
      assert.ok(
        field.name.length > 0,
        `field name for ${kind} must be a non-empty string`,
      );
    }
  }
});

test("structuredpayloadrepresentationvalidation", () => {
  const vectors = capability.verifyPayloadVectors();
  assert.equal(vectors.length, capability.PAYLOAD_KINDS.length);
  for (const result of vectors) {
    assert.ok(result.kind.length > 0, "vector kind must be set");
    assert.equal(
      result.roundTrip,
      true,
      `${result.kind}: encoded vector must classify back to ${result.kind}`,
    );
    assert.equal(
      result.nearMissRejected,
      true,
      `${result.kind}: near-miss vector must be rejected by validation`,
    );
  }

  const encoded = capability.encodePayload(
    capability.PAYLOAD_TEST_VECTORS["wifi"].valid,
  );
  const classified = capability.classifyEncoded(encoded);
  assert.equal(classified.success, true);
  assert.ok(
    classified.matches.includes("wifi"),
    "encoded wifi vector must classify as wifi",
  );
});