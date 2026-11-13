import assert from "node:assert/strict";
import test from "node:test";

import * as capability from "../../../src/capabilities/distribution/shareablerepresentation.ts";

test("shareablerepresentationcontracts", () => {
  const embed = capability.createEmbedOptions({ theme: "dark", layout: "grid" });
  const optionGroups: capability.OptionGroup[] = [
    capability.createOptionGroup("view", { showHeader: true }),
    capability.createOptionGroup("filter", { status: "active" }),
  ];
  const artefact = capability.createArtefact(
    "dashboard-payload",
    optionGroups,
    embed,
    { userId: "u-1" },
    { sessionId: "s-1" },
    { accountId: "a-1" }
  );

  assert.equal(artefact.payload, "dashboard-payload");
  assert.equal(artefact.options.length, 2);
  assert.equal(artefact.options[0]!.name, "view");
  assert.deepEqual(artefact.options[0]!.parameters, { showHeader: true });
  assert.equal(artefact.options[1]!.name, "filter");
  assert.deepEqual(artefact.options[1]!.parameters, { status: "active" });
  assert.deepEqual(artefact.embedOptions, { theme: "dark", layout: "grid" });

  const shareable = capability.toShareableArtefact(artefact);
  assert.equal(shareable.payload, "dashboard-payload");
  assert.equal(shareable.options.length, 2);
  assert.equal(shareable.options[0]!.name, "view");
  assert.equal(shareable.options[1]!.name, "filter");
  assert.deepEqual(shareable.embedOptions, { theme: "dark", layout: "grid" });

  assert.throws(
    () => capability.createArtefact("   "),
    /non-empty string/
  );
  assert.throws(
    () => capability.createEmbedOptions(null as unknown as Record<string, unknown>),
    /must be an object/
  );
});

test("shareablerepresentationerrormodel", () => {
  const result = capability.parseShareRepresentation("this is not json {");
  assert.equal(result.success, false);
  assert.equal(result.error.code, "PARSE_FAILED");
  assert.deepEqual(result.defaultArtefact, capability.DEFAULT_SHAREABLE_ARTEFACT);

  const structural = capability.parseShareRepresentation(
    JSON.stringify({ payload: "", options: [], embedOptions: {} })
  );
  assert.equal(structural.success, false);
  assert.equal(structural.error.code, "INVALID_STRUCTURE");
  assert.deepEqual(
    structural.defaultArtefact,
    capability.DEFAULT_SHAREABLE_ARTEFACT
  );

  const missingFields = capability.parseShareRepresentation(
    JSON.stringify({ payload: "ok" })
  );
  assert.equal(missingFields.success, false);
  assert.equal(missingFields.error.code, "INVALID_STRUCTURE");
  assert.deepEqual(
    missingFields.defaultArtefact,
    capability.DEFAULT_SHAREABLE_ARTEFACT
  );

  const recovered = capability.parseShareRepresentation("<<<<broken>>>>");
  assert.equal(recovered.success, false);
  if (recovered.success === false) {
    assert.equal(recovered.defaultArtefact.payload, capability.DEFAULT_PAYLOAD);
  }
});

test("shareablerepresentationpermissions", () => {
  const identity: capability.Identity = { userId: "u-secret" };
  const session: capability.Session = { sessionId: "s-secret" };
  const account: capability.Account = { accountId: "a-secret" };

  const withIdentity = capability.createArtefact(
    "payload",
    capability.DEFAULT_OPTIONS,
    capability.DEFAULT_EMBED_OPTIONS,
    identity
  );
  const withSession = capability.createArtefact(
    "payload",
    capability.DEFAULT_OPTIONS,
    capability.DEFAULT_EMBED_OPTIONS,
    undefined,
    session
  );
  const withAccount = capability.createArtefact(
    "payload",
    capability.DEFAULT_OPTIONS,
    capability.DEFAULT_EMBED_OPTIONS,
    undefined,
    undefined,
    account
  );

  for (const producer of [withIdentity, withSession, withAccount]) {
    assert.ok(
      "identity" in producer ||
        "session" in producer ||
        "account" in producer
    );
  }

  const sharedIdentity = capability.toShareableArtefact(withIdentity);
  const sharedSession = capability.toShareableArtefact(withSession);
  const sharedAccount = capability.toShareableArtefact(withAccount);

  for (const shared of [sharedIdentity, sharedSession, sharedAccount]) {
    assert.equal(
      (shared as { identity?: unknown }).identity,
      undefined
    );
    assert.equal(
      (shared as { session?: unknown }).session,
      undefined
    );
    assert.equal(
      (shared as { account?: unknown }).account,
      undefined
    );
  }

  const representation = capability.serializeShareRepresentation(sharedIdentity);
  assert.equal(representation.includes("u-secret"), false);
  assert.equal(representation.includes("s-secret"), false);
  assert.equal(representation.includes("a-secret"), false);
  assert.equal(representation.includes("userId"), false);
  assert.equal(representation.includes("sessionId"), false);
  assert.equal(representation.includes("accountId"), false);
});

test("shareablerepresentationstatemodel", () => {
  const embed = capability.createEmbedOptions({ region: "eu", locale: "en-GB" });
  const optionGroups: capability.OptionGroup[] = [
    capability.createOptionGroup("permissions", { canEdit: false }),
    capability.createOptionGroup("branding", { color: "navy" }),
  ];
  const artefact: capability.ShareableArtefact = {
    payload: "self-contained-payload",
    options: optionGroups,
    embedOptions: embed,
  };

  const representation = capability.serializeShareRepresentation(artefact);
  assert.equal(typeof representation, "string");

  const inIsolation = capability.parseShareRepresentation(representation);
  assert.equal(inIsolation.success, true);
  if (inIsolation.success === true) {
    assert.equal(inIsolation.artefact.payload, "self-contained-payload");
    assert.equal(inIsolation.artefact.options.length, 2);
    assert.equal(inIsolation.artefact.options[0]!.name, "permissions");
    assert.equal(inIsolation.artefact.options[1]!.name, "branding");
    assert.deepEqual(inIsolation.artefact.embedOptions, {
      region: "eu",
      locale: "en-GB",
    });
  }

  assert.equal(representation.startsWith("{"), true);
  assert.equal(representation.endsWith("}"), true);
  const reparsed = capability.parseShareRepresentation(representation);
  assert.equal(reparsed.success, true);
  if (reparsed.success === true) {
    assert.equal(
      JSON.stringify(reparsed.artefact),
      JSON.stringify(artefact)
    );
  }
});

test("shareablerepresentationvalidation", () => {
  const embed = capability.createEmbedOptions({ a: 1, b: "two" });
  const optionGroups: capability.OptionGroup[] = [
    capability.createOptionGroup("alpha", { x: 1 }),
    capability.createOptionGroup("beta", { y: "z" }),
    capability.createOptionGroup("gamma", { w: true }),
  ];
  const original: capability.ShareableArtefact = {
    payload: "round-trip-payload",
    options: optionGroups,
    embedOptions: embed,
  };

  const roundTripped = capability.roundTripShareRepresentation(original);
  assert.equal(roundTripped.payload, original.payload);
  assert.equal(roundTripped.options.length, original.options.length);
  for (let i = 0; i < original.options.length; i += 1) {
    assert.equal(roundTripped.options[i]!.name, original.options[i]!.name);
    assert.deepEqual(
      roundTripped.options[i]!.parameters,
      original.options[i]!.parameters
    );
  }
  assert.deepEqual(roundTripped.embedOptions, original.embedOptions);

  assert.throws(
    () =>
      capability.roundTripShareRepresentation({
        payload: "",
        options: capability.DEFAULT_OPTIONS,
        embedOptions: capability.DEFAULT_EMBED_OPTIONS,
      }),
    /Round-trip failed/
  );
});

test("share boundaries discard top-level producer metadata", () => {
  const producer = {
    payload: "shared-payload", options: [], embedOptions: {},
    identity: { userId: "private-user" },
    session: { sessionId: "private-session" },
    account: { accountId: "private-account" },
    toJSON() { return { identity: this.identity }; },
  };
  const representation = capability.serializeShareRepresentation(producer);
  assert.deepEqual(JSON.parse(representation), {
    payload: producer.payload, options: [], embedOptions: {},
  });
  // An incoming producer object need not have passed through our serializer.
  const parsed = capability.parseShareRepresentation(JSON.stringify({
    ...producer, toJSON: undefined,
  }));
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.deepEqual(Object.keys(parsed.artefact).sort(), ["embedOptions", "options", "payload"]);
    assert(!JSON.stringify(parsed.artefact).includes("private-"));
  }
});

test("share parser rejects malformed option groups and object fields", () => {
  for (const group of [null, [], "group", {}, { name: "" , parameters: {} },
    { name: "view", parameters: null }, { name: "view", parameters: [] }]) {
    const result = capability.parseShareRepresentation(JSON.stringify({
      payload: "payload", options: [group], embedOptions: {},
    }));
    assert.equal(result.success, false);
    if (!result.success) assert.equal(result.error.code, "INVALID_STRUCTURE");
  }
  const result = capability.parseShareRepresentation(JSON.stringify({
    payload: "payload", options: [], embedOptions: [],
  }));
  assert.equal(result.success, false);
});

test("share parser does not expose malformed input in errors", () => {
  const result = capability.parseShareRepresentation('private-sharing-content {');
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, "PARSE_FAILED");
    assert(!result.error.message.includes("private-sharing-content"));
  }
});
