import * as capability from "../../../src/capabilities/payload/productidentitypayload.ts";
import test from "node:test";
import assert from "node:assert/strict";

test("productidentitypayloadcontracts", () => {
  const validUrl = "https://id.example.com/gtin/09506000134352/lot/ABC123";
  const result = capability.parsePayload(validUrl);
  assert.strictEqual(result.success, true);
  if (!result.success) {
    throw new Error("expected successful parse");
  }
  const payload = result.payload;
  assert.strictEqual(payload.kind, "gs1_digital_link");
  assert.ok(
    (payload.identifierKeys as readonly string[]).includes("gtin"),
    "identifier keys should include gtin"
  );
  assert.ok(
    (payload.identifierKeys as readonly string[]).includes("lot"),
    "identifier keys should include lot"
  );
  assert.strictEqual(payload.primaryKey, "gtin");
  assert.strictEqual(payload.primaryValue, "09506000134352");
  assert.strictEqual(payload.uri, validUrl);
  assert.deepStrictEqual(
    capability.recogniseIdentifierKeys(validUrl),
    ["gtin", "lot"]
  );
});

test("productidentitypayloaderrormodel", () => {
  const notAUri = "not-a-uri";
  const invalidResult = capability.parsePayload(notAUri);
  assert.strictEqual(invalidResult.success, false);
  if (invalidResult.success) {
    throw new Error("expected parse to fail");
  }
  assert.strictEqual(invalidResult.error.code, "invalid_uri");
  assert.strictEqual(invalidResult.error.kind, "payload_error");

  const wellFormedButNotDigitalLink = "https://example.com/just/a/path";
  const refused = capability.parsePayload(wellFormedButNotDigitalLink);
  assert.strictEqual(refused.success, false);
  if (refused.success) {
    throw new Error("expected well-formed non-Digital-Link URI to be refused");
  }
  assert.strictEqual(refused.error.code, "not_digital_link");
  assert.strictEqual(
    capability.classifyPayloadKind(wellFormedButNotDigitalLink),
    "plain_url"
  );

  const unknownAi = "https://example.com/zzz/12345";
  const unknownResult = capability.parsePayload(unknownAi);
  assert.strictEqual(unknownResult.success, false);
  if (unknownResult.success) {
    throw new Error("expected unknown AI to be refused");
  }
  assert.strictEqual(unknownResult.error.code, "not_digital_link");
});

test("productidentitypayloadvalidation", () => {
  const digitalLink: string = "https://id.example.com/gtin/09506000134352";
  const digitalResult = capability.classifyProductIdentity(digitalLink);
  assert.strictEqual(digitalResult, "product_identity");

  const parsedDigital = capability.parsePayload(digitalLink);
  assert.strictEqual(parsedDigital.success, true);
  if (!parsedDigital.success) {
    throw new Error("expected Digital Link parse to succeed");
  }
  assert.strictEqual(
    capability.isProductIdentityPayload(parsedDigital.payload),
    true
  );

  const plainUrl: string = "https://example.com/no/identifiers/here";
  const plainResult = capability.classifyProductIdentity(plainUrl);
  assert.strictEqual(plainResult, "not_product_identity");

  const parsedPlain = capability.parsePayload(plainUrl);
  assert.strictEqual(parsedPlain.success, true);
  if (!parsedPlain.success) {
    throw new Error("expected plain URL parse to succeed");
  }
  assert.strictEqual(
    capability.isProductIdentityPayload(parsedPlain.payload),
    false
  );
});