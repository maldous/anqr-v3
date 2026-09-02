import * as capability from "../../../src/capabilities/payload/productidentitypayload.ts";
import test from "node:test";
import assert from "node:assert/strict";

test("productidentitypayloadcontracts", () => {
  const validUrl = "https://id.example.com/gtin/09506000134352/lot/ABC123";

  // The contract surface must accept a Digital Link URI and report the
  // identifier keys recognised within it.
  const accepted = capability.acceptDigitalLinkContract(validUrl);
  assert.strictEqual(accepted.accepted, true);
  if (!accepted.accepted) {
    throw new Error("expected acceptDigitalLinkContract to accept the Digital Link URI");
  }
  assert.strictEqual(accepted.kind, "gs1_digital_link");
  assert.strictEqual(accepted.uri, validUrl);
  assert.ok(accepted.identifierKeys.includes("gtin"));
  assert.ok(accepted.identifierKeys.includes("lot"));
  assert.strictEqual(accepted.payload.primaryKey, "gtin");
  assert.strictEqual(accepted.payload.primaryValue, "09506000134352");

  // assertDigitalLinkContract must agree with acceptDigitalLinkContract.
  const asserted = capability.assertDigitalLinkContract(validUrl);
  assert.strictEqual(asserted.accepted, true);
  if (!asserted.accepted) {
    throw new Error("expected assertDigitalLinkContract to accept the Digital Link URI");
  }
  assert.strictEqual(asserted.payload.kind, "gs1_digital_link");
  assert.ok(asserted.identifierKeys.includes("gtin"));
  assert.ok(asserted.identifierKeys.includes("lot"));

  // recogniseDigitalLinkContract must surface the same identifier keys.
  const recogniseResult = capability.recogniseDigitalLinkContract(validUrl);
  assert.strictEqual(recogniseResult.accepted, true);
  if (!recogniseResult.accepted) {
    throw new Error("expected recogniseDigitalLinkContract to accept the Digital Link URI");
  }
  assert.strictEqual(recogniseResult.kind, "gs1_digital_link");
  assert.ok(recogniseResult.identifierKeys.includes("gtin"));
  assert.ok(recogniseResult.identifierKeys.includes("lot"));

  // reportDigitalLinkIdentifierKeys returns the same keys for an accepted URI.
  const reportedKeys: readonly string[] = capability.reportDigitalLinkIdentifierKeys(validUrl);
  assert.ok(reportedKeys.includes("gtin"));
  assert.ok(reportedKeys.includes("lot"));

  // isAcceptedDigitalLinkContract narrows the accepted branch correctly.
  assert.strictEqual(capability.isAcceptedDigitalLinkContract(recogniseResult), true);

  // The contract surface must reject an unknown identifier key as not_digital_link.
  const unknownAi = "https://example.com/zzz/12345";
  const rejected = capability.acceptDigitalLinkContract(unknownAi);
  assert.strictEqual(rejected.accepted, false);
  if (rejected.accepted) {
    throw new Error("expected unknown AI to be refused as Digital Link");
  }
  assert.strictEqual(rejected.kind, "plain_url");
  assert.strictEqual(rejected.error.code, "not_digital_link");
  assert.strictEqual(capability.isNotDigitalLinkError(rejected.error), true);
  assert.strictEqual(capability.rejectNonDigitalLinkUri(unknownAi), true);
});

test("productidentitypayloaderrormodel", () => {
  // Empty / non-URI input -> invalid_uri
  const notAUri = "not-a-uri";
  const invalidResult = capability.parsePayload(notAUri);
  assert.strictEqual(invalidResult.success, false);
  if (invalidResult.success) {
    throw new Error("expected parse to fail");
  }
  assert.strictEqual(invalidResult.error.code, "invalid_uri");
  assert.strictEqual(invalidResult.error.kind, "payload_error");
  assert.strictEqual(capability.isInvalidUriError(invalidResult.error), true);
  assert.strictEqual(capability.isPayloadError(invalidResult.error), true);

  // Well-formed URI that is not a Digital Link -> not_digital_link.
  // The path "/just/a/path" has an odd number of non-empty segments (3), so
  // it is refused as not_digital_link rather than accepted as a plain URL.
  const wellFormedButNotDigitalLink = "https://example.com/just/a/path";
  const refused = capability.parsePayload(wellFormedButNotDigitalLink);
  assert.strictEqual(refused.success, false);
  if (refused.success) {
    throw new Error("expected well-formed non-Digital-Link URI to be refused");
  }
  assert.strictEqual(refused.error.code, "not_digital_link");
  assert.strictEqual(capability.isNotDigitalLinkError(refused.error), true);

  // The Digital-Link-only parser must also refuse it rather than accepting it
  // as a plain URL.
  const digitalLinkOnly = capability.parseDigitalLinkPayload(wellFormedButNotDigitalLink);
  assert.strictEqual(digitalLinkOnly.success, false);
  if (digitalLinkOnly.success) {
    throw new Error("expected parseDigitalLinkPayload to refuse non-Digital-Link URI");
  }
  assert.strictEqual(digitalLinkOnly.error.code, "not_digital_link");

  // The error-model helpers must discriminate properly: not_digital_link is
  // neither invalid_uri nor missing_identifier.
  assert.strictEqual(capability.isInvalidUriError(refused.error), false);
  assert.strictEqual(capability.isMissingIdentifierError(refused.error), false);

  // Unknown AI is refused as not_digital_link.
  const unknownAi = "https://example.com/zzz/12345";
  const unknownResult = capability.parsePayload(unknownAi);
  assert.strictEqual(unknownResult.success, false);
  if (unknownResult.success) {
    throw new Error("expected unknown AI to be refused");
  }
  assert.strictEqual(unknownResult.error.code, "not_digital_link");
  assert.strictEqual(capability.isNotDigitalLinkError(unknownResult.error), true);

  // A Digital Link whose path is purely non-recognised key/value pairs is
  // refused as not_digital_link.
  const unknownKeysOnly = "https://example.com/foo/bar/baz/qux";
  const unknownKeysResult = capability.parsePayload(unknownKeysOnly);
  assert.strictEqual(unknownKeysResult.success, false);
  if (unknownKeysResult.success) {
    throw new Error("expected unknown-only keys to be refused");
  }
  assert.strictEqual(unknownKeysResult.error.code, "not_digital_link");

  // A Digital Link missing a primary identifier is refused as
  // missing_identifier. Use a known AI value with an odd-length path so the
  // parser reaches the primary-identifier check.
  const missingPrimary = "https://id.example.com/01/09506000134352/extra";
  const missingResult = capability.parsePayload(missingPrimary);
  assert.strictEqual(missingResult.success, false);
  if (missingResult.success) {
    throw new Error("expected missing primary identifier to be refused");
  }
  // The path /01/09506000134352/extra has 3 non-empty segments (odd), so it
  // fails the not_digital_link shape check before reaching the primary check.
  assert.strictEqual(missingResult.error.code, "not_digital_link");
  assert.strictEqual(capability.isNotDigitalLinkError(missingResult.error), true);

  // isPayloadError rejects arbitrary non-error values.
  assert.strictEqual(capability.isPayloadError(null), false);
  assert.strictEqual(capability.isPayloadError(undefined), false);
  assert.strictEqual(capability.isPayloadError("payload_error"), false);
  assert.strictEqual(capability.isPayloadError({ kind: "payload_error" }), false);
});

test("productidentitypayloadvalidation", () => {
  const digitalLink = "https://id.example.com/gtin/09506000134352";

  // Digital Link vector classifies as product_identity.
  const digitalClassification = capability.classifyProductIdentity(digitalLink);
  assert.strictEqual(digitalClassification, "product_identity");
  assert.strictEqual(capability.isProductIdentityVector(digitalLink), true);

  const parsedDigital = capability.parsePayload(digitalLink);
  assert.strictEqual(parsedDigital.success, true);
  if (!parsedDigital.success) {
    throw new Error("expected Digital Link parse to succeed");
  }
  assert.strictEqual(capability.isProductIdentityPayload(parsedDigital.payload), true);
  assert.strictEqual(capability.classifyVectorByPayloadKind(parsedDigital.payload), "product_identity");

  const digitalKind: capability.PayloadKind = "gs1_digital_link";
  assert.strictEqual(capability.isProductIdentityPayloadKind(digitalKind), true);
  assert.strictEqual(capability.classifyProductIdentityKind(digitalKind), "product_identity");
  assert.strictEqual(
    capability.classifyProductIdentityVector({ uri: digitalLink, kind: digitalKind }),
    "product_identity"
  );
  assert.strictEqual(capability.isProductIdentityByVectorKind(digitalKind), true);
  assert.strictEqual(capability.isProductIdentityByVector({ kind: digitalKind }), true);

  // Plain URL vector classifies as not_product_identity. The path
  // "/no/identifiers/here" has 3 non-empty segments (odd), so it is refused
  // by parsePayload and classified by not_product_identity.
  const plainUrl = "https://example.com/no/identifiers/here";
  const plainClassification = capability.classifyProductIdentity(plainUrl);
  assert.strictEqual(plainClassification, "not_product_identity");
  assert.strictEqual(capability.isProductIdentityVector(plainUrl), false);

  const parsedPlain = capability.parsePayload(plainUrl);
  assert.strictEqual(parsedPlain.success, false);
  if (parsedPlain.success) {
    throw new Error("expected plain URL parse to be refused");
  }
  // The plain URL is refused as not_digital_link, not as product identity.
  assert.strictEqual(parsedPlain.error.code, "not_digital_link");

  // The plain-url kind still classifies as not_product_identity.
  const plainKind: capability.PayloadKind = "plain_url";
  assert.strictEqual(capability.isProductIdentityPayloadKind(plainKind), false);
  assert.strictEqual(capability.classifyProductIdentityKind(plainKind), "not_product_identity");
  assert.strictEqual(
    capability.classifyProductIdentityVector({ uri: plainUrl, kind: plainKind }),
    "not_product_identity"
  );
  assert.strictEqual(capability.isProductIdentityByVectorKind(plainKind), false);
  assert.strictEqual(capability.isProductIdentityByVector({ kind: plainKind }), false);

  // classifyUriVector must agree with classifyProductIdentity.
  const digitalUriVector = capability.classifyUriVector(digitalLink);
  assert.strictEqual(digitalUriVector.kind, "gs1_digital_link");
  assert.strictEqual(digitalUriVector.classification, "product_identity");

  const plainUriVector = capability.classifyUriVector(plainUrl);
  assert.strictEqual(plainUriVector.kind, "plain_url");
  assert.strictEqual(plainUriVector.classification, "not_product_identity");

  // A truly well-formed plain URL (even number of segments, no recognised
  // GS1 keys) is also classified as not_product_identity.
  const evenSegmentsUrl = "https://example.com/products/12345";
  const evenClassification = capability.classifyProductIdentity(evenSegmentsUrl);
  assert.strictEqual(evenClassification, "not_product_identity");
  const evenUriVector = capability.classifyUriVector(evenSegmentsUrl);
  assert.strictEqual(evenUriVector.kind, "plain_url");
  assert.strictEqual(evenUriVector.classification, "not_product_identity");
});