import assert from "node:assert/strict";
import test from "node:test";

import * as capability from "../../../src/capabilities/payload/paymentpayloadrepresentation.ts";

test("paymentpayloadrepresentationcontracts", () => {
  const registry = capability.createSchemeRegistry();
  const unverified = capability.reportUnverified(registry);
  const expected: readonly capability.PaymentKind[] = [
    "epc_sepa",
    "upi",
    "paynow",
    "promptpay",
    "pix",
    "swiss_qr_bill",
    "qris",
    "duitnow",
    "bharatqr",
    "vietqr",
    "qrph",
    "twqr",
    "hkqr",
    "jpqr",
    "auspaynet",
    "emv_generic",
    "crypto",
    "lightning",
    "ethereum_eip681",
    "paypal_me",
    "cashapp",
  ];
  assert.deepEqual([...unverified].sort(), [...expected].sort());
  const supported = capability.reportSupported(registry);
  assert.deepEqual([...supported], []);
});

test("paymentpayloadrepresentationerrormodel", () => {
  const payload: capability.PaymentPayload = {
    scheme: "epc_sepa",
    fields: [
      { name: "iban", value: "DE89370400440532013000" },
      { name: "beneficiary", value: "Acme GmbH" },
    ],
  };
  const result = capability.validatePayload(payload);
  assert.equal(result.success, false);
  if (result.success) {
    throw new Error("expected validation to fail when 'amount' is absent");
  }
  assert.equal(result.error.kind, "field_required");
  assert.equal(result.error.scheme, "epc_sepa");
  assert.equal(result.error.field, "amount");
  assert.ok(
    !result.error.message.includes("32013000"),
    "the refusal message must not echo the iban value",
  );
  assert.ok(
    !result.error.message.includes("Acme GmbH"),
    "the refusal message must not echo the beneficiary value",
  );
  assert.ok(
    result.error.message.includes("amount"),
    "the refusal message must name the missing field",
  );
  assert.ok(
    result.error.message.includes("epc_sepa"),
    "the refusal message must name the scheme",
  );

  const present: capability.PaymentPayload = {
    scheme: "epc_sepa",
    fields: [
      { name: "iban", value: "DE89370400440532013000" },
      { name: "beneficiary", value: "Acme GmbH" },
      { name: "amount", value: "EUR12.34" },
    ],
  };
  const ok = capability.validatePayload(present);
  assert.equal(ok.success, true);
  if (!ok.success) {
    throw new Error("expected validation to succeed when all required fields are present");
  }
  assert.equal(ok.payload.scheme, "epc_sepa");
});

test("paymentpayloadrepresentationpermissions", () => {
  const payload: capability.PaymentPayload = {
    scheme: "upi",
    fields: [
      { name: "pa", value: "alice@upi" },
      { name: "pn", value: "Alice" },
      { name: "am", value: "INR100.00" },
    ],
  };
  const acceptedAudit = () => ({ success: true });
  const result = capability.formatPayload(payload, acceptedAudit);
  assert.equal(result.success, true);
  if (!result.success) {
    throw new Error("expected formatPayload to succeed with an accepting audit");
  }
  assert.ok(
    typeof result.formatted === "string" && result.formatted.length > 0,
    "formatPayload must produce a non-empty string on success",
  );
  const keys = Object.keys(result);
  assert.deepEqual(keys.sort(), ["formatted", "success"].sort());

  const refusedAudit = () => ({ success: false, reason: "no identity provided" });
  const refused = capability.formatPayload(payload, refusedAudit);
  assert.equal(refused.success, false);
  if (refused.success) {
    throw new Error("expected formatPayload to be refused when audit denies");
  }
  assert.equal(refused.error.kind, "format_error");
  assert.equal(refused.error.scheme, "upi");
  assert.ok(!("formatted" in refused), "no formatted output may be returned when the audit refuses");

  const throwingAudit = () => {
    throw new Error("audit exploded");
  };
  const thrown = capability.formatPayload(payload, throwingAudit);
  assert.equal(thrown.success, false);
  if (thrown.success) {
    throw new Error("expected formatPayload to refuse when the audit throws");
  }
  assert.equal(thrown.error.kind, "format_error");
  assert.ok(!("formatted" in thrown), "no formatted output may be returned when the audit throws");
});

test("paymentpayloadrepresentationproof", () => {
  const registry = capability.createSchemeRegistry();
  const kind: capability.PaymentKind = "pix";
  
  const missing = capability.assertConformance(
    registry,
    kind,
    () => ({ success: true }),
  );
  assert.equal(missing.success, false);
  if (missing.success) {
    throw new Error("expected conformance to be refused when no vector is registered");
  }
  assert.equal(missing.error.kind, "unverified_scheme");
  assert.equal(missing.error.scheme, kind);

  const vector: capability.SchemeVector = {
    scheme: kind,
    representative: "00020126580014br.gov.bcb.pix0114+5511999999999520400005303986540510.005802BR5913Alice6009Sao Paulo62070503***6304ABCD",
    classification: "ISO 20022 / BACEN Pix specification",
  };
  const auditDenies = () => ({
    success: false,
    reason: "vector cannot be traced to a published standard",
  });
  const registryWithVector = capability.registerScheme(registry, vector, () => ({ success: true }));
  const audited = capability.assertConformance(
    registryWithVector,
    kind,
    auditDenies,
  );
  assert.equal(audited.success, false);
  if (audited.success) {
    throw new Error("expected conformance to be refused when audit denies traceability");
  }
  assert.equal(audited.error.kind, "unverified_scheme");
  assert.ok(
    audited.error.message.toLowerCase().includes("lexical") ||
    audited.error.message.toLowerCase().includes("published") ||
    audited.error.message.toLowerCase().includes("derived"),
    "the refusal must explain that lexical plausibility is not conformance",
  );

  const auditAccepts = () => ({ success: true });
  const proven = capability.assertConformance(
    registryWithVector,
    kind,
    auditAccepts,
  );
  assert.equal(proven.success, true);
  if (!proven.success) {
    throw new Error("expected conformance to be claimed when an audited vector is present");
  }
  assert.equal(proven.scheme, kind);
  assert.ok(proven.claim.length > 0, "the conformance claim must be non-empty");
});

test("paymentpayloadrepresentationvalidation", () => {
  const empty = capability.createSchemeRegistry();
  const supportedEmpty = capability.reportSupported(empty);
  assert.deepEqual([...supportedEmpty], []);
  const unverifiedEmpty = capability.reportUnverified(empty);
  assert.equal(
    unverifiedEmpty.length,
    capability.DECLARED_PAYMENT_KINDS.length,
    "an empty registry must report every declared scheme as unverified",
  );

  const partial: capability.SchemeVector = {
    scheme: "pix",
    representative: "",
    classification: "ISO 20022 / BACEN Pix specification",
  };
  const partialRegistry = capability.registerScheme(
    empty,
    partial,
    () => ({ success: true }),
  );
  const supportedPartial = capability.reportSupported(partialRegistry);
  assert.ok(
    !supportedPartial.includes("pix"),
    "a scheme missing its representative vector must not be reported as supported",
  );
  const unverifiedPartial = capability.reportUnverified(partialRegistry);
  assert.ok(
    unverifiedPartial.includes("pix"),
    "a scheme missing its representative vector must be reported as unverified",
  );

  const full: capability.SchemeVector = {
    scheme: "pix",
    representative: "00020126580014br.gov.bcb.pix0114+5511999999999520400005303986540510.005802BR5913Alice6009Sao Paulo62070503***6304ABCD",
    classification: "ISO 20022 / BACEN Pix specification",
  };
  const fullRegistry = capability.registerScheme(
    partialRegistry,
    full,
    () => ({ success: true }),
  );
  const supportedFull = capability.reportSupported(fullRegistry);
  assert.ok(
    supportedFull.includes("pix"),
    "a scheme with both vectors must be reported as supported",
  );
  const unverifiedFull = capability.reportUnverified(fullRegistry);
  assert.ok(
    !unverifiedFull.includes("pix"),
    "a scheme with both vectors must not be reported as unverified",
  );

  const looked = capability.lookupScheme(fullRegistry, "pix");
  assert.ok(looked !== null, "the registered vector must be retrievable by lookupScheme");
  if (looked !== null) {
    assert.equal(looked.scheme, "pix");
    assert.ok(looked.representative.length > 0);
    assert.ok(looked.classification.length > 0);
  }
  const absent = capability.lookupScheme(fullRegistry, "crypto");
  assert.equal(absent, null, "an unregistered scheme must not be retrievable");
});