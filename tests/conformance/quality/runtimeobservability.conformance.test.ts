import assert from "node:assert/strict";
import test from "node:test";

import * as capability from "../../../src/capabilities/quality/runtimeobservability.ts";

const event = (kind: capability.EventKind): capability.RuntimeEvent =>
  ({ kind, route: "/api/qr", durationMs: 12, outcome: "ok", detail: null });

test("runtimeobservabilitycontracts", () => {
  // The event taxonomy, the sink contract and the health and readiness answers.
  assert.deepEqual([...capability.EVENT_KINDS],
    ["request", "render", "refusal", "failure", "degradation"]);
  assert.deepEqual([...capability.RUNTIMES], ["static", "function", "edge", "background"]);
  const sink = new capability.MemorySink();
  for (const kind of capability.EVENT_KINDS) capability.emit(sink, event(kind));
  assert.equal(sink.sent.length, capability.EVENT_KINDS.length);
  // Every runtime answers presence and readiness separately.
  const report = capability.healthReport({
    static: { present: true, ready: true },
    function: { present: true, ready: false },
    edge: { present: false, ready: false },
    background: { present: true, ready: true },
  });
  assert.equal(report.length, 4);
  assert.deepEqual(report.map((answer) => answer.detail),
    ["ready", "present but not ready", "absent", "ready"]);
});

test("runtimeobservabilityauditmodel", () => {
  // No emitted event contains payload content.
  const sink = new capability.MemorySink();
  const withPayload = {
    ...event("render"),
    // A caller trying to attach what the user encoded.
    data: "https://private.example/secret",
    payload: "vCard with a home address",
  } as capability.RuntimeEvent;
  capability.emit(sink, withPayload);
  const emitted = sink.sent[0];
  assert.ok(emitted !== undefined);
  assert.equal(capability.containsPayload(emitted), false);
  assert.equal(JSON.stringify(emitted).includes("private.example"), false,
    "what a user encodes is theirs and must never reach a sink");
  assert.equal(JSON.stringify(emitted).includes("home address"), false);
  // The permitted fields are still there, so the event is still useful.
  assert.equal(emitted.route, "/api/qr");
  assert.equal(emitted.kind, "render");
  // Sanitising is a whitelist: an unknown extra field is not carried through.
  const sanitised = capability.sanitise(event("request"), { newParameter: "leaked" });
  assert.equal("newParameter" in sanitised, false);
});

test("runtimeobservabilityerrormodel", () => {
  // Sink unavailability degrades silently to the user and visibly to the operator.
  const sink = new capability.MemorySink();
  sink.setReachable(false);
  const result = capability.emit(sink, event("request"));
  assert.equal(result.delivered, false);
  assert.equal(result.productAffected, false, "the product's own behaviour is unaffected");
  assert.notEqual(result.operatorNotice, null, "and the operator can see it");
  assert.match(result.operatorNotice ?? "", /unreachable/u);
  // Recovery resumes delivery without ceremony.
  sink.setReachable(true);
  assert.equal(capability.emit(sink, event("request")).delivered, true);
  assert.equal(capability.emit(sink, event("request")).operatorNotice, null);
});

test("runtimeobservabilityreadinessmodel", () => {
  // Presence and readiness are separately observable per runtime: a runtime
  // present but not ready is the case a single boolean hides.
  const presentNotReady = capability.health("function", true, false);
  assert.equal(presentNotReady.present, true);
  assert.equal(presentNotReady.ready, false);
  assert.equal(presentNotReady.detail, "present but not ready");
  const absent = capability.health("edge", false, true);
  assert.equal(absent.present, false);
  assert.equal(absent.ready, false, "an absent runtime cannot be ready, whatever it claims");
  assert.equal(absent.detail, "absent");
  const ready = capability.health("static", true, true);
  assert.equal(ready.ready, true);
  // The three states are distinguishable, which is the whole point.
  assert.equal(new Set([presentNotReady.detail, absent.detail, ready.detail]).size, 3);
});
