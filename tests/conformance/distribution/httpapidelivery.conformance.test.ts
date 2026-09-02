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