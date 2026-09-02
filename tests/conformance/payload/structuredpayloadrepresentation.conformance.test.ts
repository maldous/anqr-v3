import assert from "node:assert/strict";
import test from "node:test";

import * as capability from "../../../src/capabilities/payload/structuredpayloadrepresentation.ts";

test("structuredpayloadrepresentationcontracts", () => {
  const declared: readonly capability.PayloadKind[] = capability.PAYLOAD_KINDS;
  const required: readonly capability.PayloadKind[] = [
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
  ] as const;
  for (const kind of required) {
    assert.ok(
      (declared as readonly string[]).includes(kind),
      `PAYLOAD_KINDS must include ${kind}`,
    );
    const schema = capability.getPayloadSchema(kind);
    assert.equal(schema.kind, kind);
    assert.ok(
      schema.fields.length > 0,
      `${kind} must declare at least one field`,
    );
    assert.equal(
      capability.isPayloadKind(kind),
      true,
      `isPayloadKind must recognise ${kind}`,
    );
  }
  assert.equal(
    declared.length,
    required.length,
    "PAYLOAD_KINDS must contain exactly the declared kinds",
  );
});

test("structuredpayloadrepresentationerrormodel", () => {
  const missing = capability.validatePayload(
    capability.createEmptyPayload("url"),
  );
  assert.equal(missing.success, false);
  if (missing.success) return;
  assert.equal(missing.error.kind, "field_error");
  assert.equal(
    missing.error.identifier,
    "structuredpayloadrepresentation:field_error",
  );
  assert.equal(missing.error.field, "url");
  assert.ok(
    missing.error.reason.toLowerCase().includes("url"),
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
  assert.equal(
    malformed.error.identifier,
    "structuredpayloadrepresentation:format_error",
  );
  assert.equal(malformed.error.field, "url");
  assert.ok(
    !malformed.error.reason.includes("not-a-url"),
    "format_error reason must not echo the supplied value back",
  );

  const wifiState: capability.PayloadState = capability.createPayloadState(
    capability.createPresentation(),
    capability.createEmptyPayload("wifi"),
  );
  const other = capability.applyFieldValue(wifiState, "ssid", "");
  assert.equal(other.success, false);
  if (other.success) return;
  assert.equal(other.error.kind, "field_error");
  assert.equal(other.error.field, "ssid");
  assert.ok(
    other.error.reason.toLowerCase().includes("ssid"),
    "missing-field reason must name the field",
  );

  const wifiWithValue: capability.PayloadState = capability.createPayloadState(
    capability.createPresentation(),
    { kind: "wifi", values: { ssid: "MyNet", security: "WPA" } },
  );
  const badKind = capability.selectKind(
    wifiWithValue,
    "not_a_real_kind" as capability.PayloadKind,
  );
  assert.equal(badKind.success, false);
  if (badKind.success) return;
  assert.equal(badKind.error.kind, "unknown_kind");
  assert.equal(
    badKind.error.identifier,
    "structuredpayloadrepresentation:unknown_kind",
  );
  assert.ok(
    !badKind.error.reason.includes("MyNet"),
    "unknown_kind reason must not echo any previously supplied value",
  );
});

test("structuredpayloadrepresentationstatemodel", () => {
  const presentation: capability.PresentationOptions =
    capability.createPresentation("#111111", "#eeeeee", "large", "H");
  const initialState: capability.PayloadState = capability.createPayloadState(
    presentation,
    capability.createEmptyPayload("plain_text"),
  );

  const switched = capability.selectKind(initialState, "wifi");
  assert.equal(switched.success, true);
  if (!switched.success) return;
  assert.deepEqual(switched.state.presentation, presentation);
  assert.equal(switched.state.payload.kind, "wifi");
  assert.deepEqual(switched.state.payload.values, {});
  assert.equal(
    switched.state.identifier,
    "structuredpayloadrepresentation:state",
  );

  const recoloured = capability.withPresentation(
    switched.state,
    (p): capability.PresentationOptions => ({
      foregroundColor: "#222222",
      backgroundColor: "#dddddd",
      moduleSize: p.moduleSize,
      errorCorrection: p.errorCorrection,
    }),
  );
  assert.deepEqual(recoloured.presentation, {
    foregroundColor: "#222222",
    backgroundColor: "#dddddd",
    moduleSize: "large",
    errorCorrection: "H",
  });
  assert.equal(recoloured.payload.kind, "wifi");
  assert.deepEqual(recoloured.payload.values, {});

  const filled = capability.applyFieldValue(recoloured, "ssid", "MyNet");
  assert.equal(filled.success, true);
  if (!filled.success) return;
  assert.deepEqual(filled.state.presentation, recoloured.presentation);
  assert.equal(filled.state.payload.kind, "wifi");
  assert.equal(filled.state.payload.values["ssid"], "MyNet");

  const presentationBefore = filled.state.presentation;
  const recolouredAgain = capability.changePresentation(
    filled.state,
    (p): capability.PresentationOptions => ({
      ...p,
      foregroundColor: "#abcdef",
    }),
  );
  assert.equal(recolouredAgain.payload.kind, "wifi");
  assert.equal(recolouredAgain.payload.values["ssid"], "MyNet");
  assert.deepEqual(recolouredAgain.payload, filled.state.payload);
  assert.notEqual(
    recolouredAgain.presentation.foregroundColor,
    presentationBefore.foregroundColor,
  );

  const presentationAuditCalls: number[] = [];
  const audited = capability.withPresentation(
    filled.state,
    (p): capability.PresentationOptions => {
      presentationAuditCalls.push(1);
      return {
        foregroundColor: "#333333",
        backgroundColor: p.backgroundColor,
        moduleSize: p.moduleSize,
        errorCorrection: p.errorCorrection,
      };
    },
    (before, after): void => {
      assert.deepEqual(before, filled.state.presentation);
      assert.equal(after.foregroundColor, "#333333");
    },
  );
  assert.equal(presentationAuditCalls.length, 1);
  assert.equal(audited.payload.kind, "wifi");
  assert.equal(audited.payload.values["ssid"], "MyNet");
});

test("structuredpayloadrepresentationuisemantics", () => {
  const wifiFields: readonly capability.PayloadField[] =
    capability.getFieldsForKind("wifi");
  const wifiNames = new Set(wifiFields.map((f) => f.name));
  assert.ok(wifiNames.has("ssid"));
  assert.ok(wifiNames.has("password"));
  assert.ok(wifiNames.has("security"));
  assert.ok(wifiNames.has("hidden"));
  assert.ok(!wifiNames.has("url"), "wifi must not expose a url field");
  assert.ok(!wifiNames.has("address"), "wifi must not expose an address field");

  const urlFields: readonly capability.PayloadField[] =
    capability.getFieldsForKind("url");
  const urlNames = new Set(urlFields.map((f) => f.name));
  assert.deepEqual([...urlNames].sort(), ["url"]);
  assert.ok(!urlNames.has("ssid"), "url must not expose a wifi field");

  const declared: readonly capability.PayloadKind[] = capability.PAYLOAD_KINDS;
  for (const kind of declared) {
    const fields: readonly capability.PayloadField[] =
      capability.getFieldsForKind(kind);
    assert.ok(fields.length > 0, `${kind} must declare fields`);
    const seen = new Set<string>();
    for (const field of fields) {
      assert.ok(
        !seen.has(field.name),
        `${kind} must not declare duplicate field ${field.name}`,
      );
      seen.add(field.name);
      assert.ok(
        field.name.length > 0,
        `field name for ${kind} must be a non-empty string`,
      );
      assert.ok(
        field.label.length > 0,
        `field label for ${kind}.${field.name} must be a non-empty string`,
      );
      assert.equal(typeof field.required, "boolean");
    }
  }

  const wifiPayload: capability.Payload = {
    kind: "wifi",
    values: { ssid: "MyNet", security: "WPA" },
  };
  const presented: readonly capability.PayloadFieldPresentation[] =
    capability.presentFields(wifiPayload);
  assert.equal(presented.length, wifiFields.length);
  const presentedNames = new Set(presented.map((p) => p.field.name));
  for (const f of wifiFields) {
    assert.ok(
      presentedNames.has(f.name),
      `presentFields must surface ${f.name} for wifi`,
    );
  }

  const selected = capability.selectKind(
    capability.createPayloadState(
      capability.createPresentation(),
      capability.createEmptyPayload("plain_text"),
    ),
    "event",
  );
  assert.equal(selected.success, true);
  if (!selected.success) return;
  const eventSchema = capability.getPayloadSchema("event");
  const eventPresented = capability.presentFields(selected.state.payload);
  assert.equal(eventSchema.kind, "event");
  assert.equal(eventPresented.length, eventSchema.fields.length);
  for (const entry of eventPresented) {
    const schemaField = eventSchema.fields.find(
      (f) => f.name === entry.field.name,
    );
    assert.ok(
      schemaField,
      `presented field ${entry.field.name} must be declared by event`,
    );
    assert.equal(entry.visible, true);
  }
});

test("structuredpayloadrepresentationvalidation", () => {
  const kinds: readonly capability.PayloadKind[] = capability.PAYLOAD_KINDS;

  const verifications: readonly capability.PayloadVerification[] =
    capability.verifyValidationVectors();
  assert.equal(verifications.length, kinds.length);
  for (const v of verifications) {
    assert.equal(
      v.roundTrip,
      true,
      `${v.kind}: encoded representative must round-trip via classification`,
    );
    assert.equal(
      v.nearMissRejected,
      true,
      `${v.kind}: near-miss vector must be rejected`,
    );
  }

  const demoResult = capability.demo();
  assert.equal(demoResult.length, kinds.length);
  for (const v of demoResult) {
    assert.equal(
      v.roundTrip,
      true,
      `demo: ${v.kind} representative must round-trip`,
    );
    assert.equal(
      v.nearMissRejected,
      true,
      `demo: ${v.kind} near-miss must be rejected`,
    );
  }

  const vectorKinds: readonly string[] = Object.keys(
    capability.PAYLOAD_VALIDATION_VECTORS,
  );
  for (const kindName of vectorKinds) {
    const kind = kindName as capability.PayloadKind;
    const vector: capability.PayloadValidationVector =
      capability.PAYLOAD_VALIDATION_VECTORS[kind];
    assert.ok(vector, `${kind} must have a validation vector`);
    assert.equal(vector.kind, kind);
    assert.equal(vector.representative.kind, kind);
    assert.equal(vector.nearMiss.kind, kind);
  }

  const verifyingKinds: ReadonlySet<string> = new Set(
    verifications.map((v) => v.kind as string),
  );
  for (const kind of kinds) {
    assert.ok(
      verifyingKinds.has(kind),
      `verifyValidationVectors must cover ${kind}`,
    );
  }

  const bizNearMiss: capability.Payload = {
    kind: "bizcard",
    values: { name: "Jane", company: "" },
  };
  const bizResult: capability.PayloadVerification | undefined =
    verifications.find((v) => v.kind === "bizcard");
  assert.ok(bizResult, "bizcard verification must be reported");
  assert.equal(bizResult.nearMissRejected, true);
  const bizInvalid = capability.validatePayload(bizNearMiss);
  assert.equal(bizInvalid.success, false);
});