import assert from "node:assert/strict";
import test from "node:test";
import * as capability from "../../../src/capabilities/distribution/httpapidelivery.ts";

test("httpapideliveryauditmodel", () => {
  const initial = capability.createInitialApiState();
  const after = capability.auditRequest(initial);
  assert.strictEqual(after.requestCount, initial.requestCount + 1);
  // Ensure no payload content is retained
  assert.ok(!('payload' in after));
});

test("httpapideliverycontracts", () => {
  const state = capability.createInitialApiState();
  const validPayload = capability.createDeliveryPayload(100, 'L', '#000', '#fff', 'png', 4);
  const success = capability.deliverPayload(state, validPayload);
  assert.strictEqual(success.success, true);
  assert.ok(success.artefact);
  assert.strictEqual(success.artefact.metadata.size, 100);
  assert.strictEqual(success.artefact.metadata.format, 'png');

  const invalidPayload = capability.createDeliveryPayload(0, 'L', '#000', '#fff', 'png');
  const errorResp = capability.deliverPayload(state, invalidPayload);
  assert.strictEqual(errorResp.success, false);
  assert.ok(errorResp.error);
  assert.strictEqual(errorResp.error.code, 'CLIENT_ERROR');
  assert.ok(errorResp.error.detail);
});

test("httpapideliveryerrormodel", () => {
  const clientErr = capability.createClientError('foreground', 'Foreground color is required');
  assert.strictEqual(clientErr.code, 'CLIENT_ERROR');
  assert.strictEqual(clientErr.parameter, 'foreground');
  assert.strictEqual(clientErr.detail, 'Foreground color is required');

  const serverErr = capability.createServerError('something broke');
  assert.strictEqual(serverErr.code, 'SERVER_ERROR');
  assert.strictEqual(serverErr.detail, 'Internal server error');
  assert.ok(!('parameter' in serverErr));
});

test("httpapideliverypermissions", () => {
  assert.strictEqual(capability.checkPublicAccess(), true);
});

test("httpapideliveryreadinessmodel", () => {
  const aligned = capability.createInitialApiState();
  assert.strictEqual(capability.checkContractAlignment(aligned), true);

  const misaligned: capability.ApiState = {
    ...aligned,
    servedRoutes: ['/api/delivery']
  };
  assert.strictEqual(capability.checkContractAlignment(misaligned), false);

  const driftResponse = capability.deliverPayload(
    misaligned,
    capability.createDeliveryPayload(100, 'L', '#000', '#fff', 'png')
  );
  assert.strictEqual(driftResponse.success, false);
  assert.strictEqual(driftResponse.error?.code, 'CONTRACT_DRIFT');
});

test("httpapideliveryvalidation", () => {
  const contract = capability.createInitialApiState().contract;
  const covered = capability.testContractCoverage(contract, [200, 400, 500]);
  assert.strictEqual(covered, true);

  const uncovered = capability.testContractCoverage(contract, [200, 400]);
  assert.strictEqual(uncovered, false);
});

test("HTTP finite measurement guard rejects nonfinite size", () => {
  for (const size of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const payload = capability.createDeliveryPayload(size, 'L', '#000', '#fff', 'png', 4);
    const error = capability.validatePayload(payload);
    assert.strictEqual(error?.code, 'CLIENT_ERROR');
    assert.strictEqual(error?.parameter, 'size');
    const response = capability.deliverPayload(capability.createInitialApiState(), payload);
    assert.strictEqual(response.success, false);
    assert.strictEqual(response.error?.parameter, 'size');
    assert.strictEqual(response.artefact, undefined);
  }
});

test("HTTP finite measurement guard rejects nonfinite margin", () => {
  for (const margin of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const payload = capability.createDeliveryPayload(100, 'L', '#000', '#fff', 'png', margin);
    const error = capability.validatePayload(payload);
    assert.strictEqual(error?.code, 'CLIENT_ERROR');
    assert.strictEqual(error?.parameter, 'margin');
    const response = capability.deliverPayload(capability.createInitialApiState(), payload);
    assert.strictEqual(response.success, false);
    assert.strictEqual(response.error?.parameter, 'margin');
    assert.strictEqual(response.artefact, undefined);
  }
});

test("HTTP finite measurement guard preserves admitted finite measurements", () => {
  for (const size of [capability.MIN_PAYLOAD_SIZE, 2.5, capability.MAX_PAYLOAD_SIZE]) {
    for (const margin of [0, 0.5, capability.DEFAULT_MARGIN]) {
      const payload = capability.createDeliveryPayload(size, 'L', '#000', '#fff', 'png', margin);
      assert.strictEqual(capability.validatePayload(payload), null);
    }
  }
});

test("HTTP finite measurement guard preserves existing finite refusal details", () => {
  for (const size of [capability.MIN_PAYLOAD_SIZE - 1, capability.MAX_PAYLOAD_SIZE + 1]) {
    const error = capability.validatePayload(capability.createDeliveryPayload(size, 'L', '#000', '#fff', 'png'));
    assert.deepStrictEqual(error, {
      code: 'CLIENT_ERROR',
      detail: `Size must be between ${capability.MIN_PAYLOAD_SIZE} and ${capability.MAX_PAYLOAD_SIZE}`,
      parameter: 'size',
    });
  }
  const error = capability.validatePayload(capability.createDeliveryPayload(100, 'L', '#000', '#fff', 'png', -1));
  assert.deepStrictEqual(error, { code: 'CLIENT_ERROR', detail: 'Margin must be non-negative', parameter: 'margin' });
});

test("HTTP finite measurement guard keeps rejected request audit semantics", () => {
  for (const payload of [
    capability.createDeliveryPayload(Number.NaN, 'L', '#000', '#fff', 'png'),
    capability.createDeliveryPayload(100, 'L', '#000', '#fff', 'png', Number.POSITIVE_INFINITY),
  ]) {
    const initial = capability.createInitialApiState();
    const { newState, response } = capability.processDeliveryRequest(initial, payload);
    assert.strictEqual(initial.requestCount, 0);
    assert.strictEqual(newState.requestCount, 1);
    assert.strictEqual('payload' in newState, false);
    assert.strictEqual(response.success, false);
    assert.strictEqual(response.error?.code, 'CLIENT_ERROR');
    assert.strictEqual(response.artefact, undefined);
  }
});
