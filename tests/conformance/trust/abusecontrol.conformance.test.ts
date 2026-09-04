import assert from "node:assert/strict";
import test from "node:test";

import * as capability from "../../../src/capabilities/trust/abusecontrol.ts";

test("abusecontrolcontracts", () => {
  // The per-route limits, the refusal code and the retry signal.
  assert.deepEqual(capability.ROUTE_LIMITS.map((limit) => limit.route), ["render", "contract-render", "agent"]);
  for (const limit of capability.ROUTE_LIMITS) {
    assert.ok(limit.permitted > 0 && limit.windowMs > 0);
    assert.ok(limit.reason.length > 20, `${limit.route} must say why its limit differs`);
  }
  // Limits are per route rather than global, because the routes cost differently.
  const render = capability.limitFor("render");
  const contract = capability.limitFor("contract-render");
  assert.notEqual(render.permitted, contract.permitted);
  // Only a rate refusal carries a retry signal.
  assert.equal(capability.refusal("rate-limited", "d", 30).retryAfterSeconds, 30);
  assert.equal(capability.refusal("unauthorised", "d", 30).retryAfterSeconds, null);
  assert.equal(capability.refusal("render-failed", "d", 30).retryAfterSeconds, null);
});

test("abusecontrolerrormodel", () => {
  // A rate refusal is distinguishable from an authorisation refusal and from a
  // render failure — by kind, by code and by status.
  const kinds = ["rate-limited", "unauthorised", "render-failed"] as const;
  const refusals = kinds.map((kind) => capability.refusal(kind, "detail"));
  assert.equal(new Set(refusals.map((r) => r.kind)).size, 3);
  assert.equal(new Set(refusals.map((r) => r.code)).size, 3);
  assert.equal(new Set(refusals.map((r) => r.status)).size, 3);
  assert.equal(refusals[0]?.status, 429);
  assert.equal(refusals[1]?.status, 401);
});

test("abusecontrolpermissions", () => {
  // The limit is enforced before the handler does work, not after.
  let now = 0;
  const limiter = new capability.RateLimiter(() => now);
  const limit = capability.limitFor("render");
  let handlerCalls = 0;
  const handler = (): string => { handlerCalls += 1; return "bytes"; };
  for (let index = 0; index < limit.permitted; index += 1) capability.guard(limiter, "render", "a", handler);
  assert.equal(handlerCalls, limit.permitted);
  const refused = capability.guard(limiter, "render", "a", handler);
  assert.equal(refused.decision.admitted, false);
  assert.equal(refused.handlerInvoked, false, "a refused request must not reach the handler");
  assert.equal(handlerCalls, limit.permitted, "the handler count must not move on a refusal");

  // And the limiter's own state being unavailable fails the route closed.
  limiter.setStateAvailable(false);
  const closed = capability.guard(limiter, "contract-render", "fresh-origin", handler);
  assert.equal(closed.decision.admitted, false, "an unavailable limiter must fail closed, not open");
  assert.equal(closed.handlerInvoked, false);
});

test("abusecontrolvalidation", () => {
  // Exceeding a declared limit is refused, and the refusal costs no render.
  let now = 1_000;
  const limiter = new capability.RateLimiter(() => now);
  let renders = 0;
  const render = (): string => { renders += 1; return "png"; };
  const limit = capability.limitFor("agent");
  for (let index = 0; index < limit.permitted; index += 1) {
    assert.equal(capability.guard(limiter, "agent", "consumer", render).decision.admitted, true);
  }
  const refused = capability.guard(limiter, "agent", "consumer", render);
  assert.equal(refused.decision.admitted, false);
  if (refused.decision.admitted) return;
  assert.equal(refused.decision.code, capability.REFUSAL_CODES["rate-limited"]);
  assert.ok((refused.decision.retryAfterSeconds ?? 0) > 0, "a rate refusal must say when to retry");
  assert.equal(renders, limit.permitted, "the refusal must cost no render");

  // A different origin is unaffected, and the window expires.
  assert.equal(capability.guard(limiter, "agent", "other", render).decision.admitted, true);
  now += limit.windowMs;
  assert.equal(capability.guard(limiter, "agent", "consumer", render).decision.admitted, true);
});
