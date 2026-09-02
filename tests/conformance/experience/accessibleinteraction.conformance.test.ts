import assert from 'node:assert/strict';
import test from 'node:test';
import * as capability from '../../../src/capabilities/experience/accessibleinteraction.ts';

test('accessibleinteractioncontracts', () => {
  const control = capability.createControl('c1', 'Accessible Name', 'button', 'enabled');
  assert.ok(control.accessibleName);
  assert.ok(control.role);
  assert.ok(control.currentState);

  const controls = [control, capability.createControl('c2', 'Second')];
  const withOrder = capability.setFocusOrder(controls);
  assert.equal(withOrder[0].focusOrder, 0);
  assert.equal(withOrder[1].focusOrder, 1);
});

test('accessibleinteractionerrormodel', () => {
  const invalid: capability.InteractiveControl = {
    id: 'invalid',
    accessibleName: '',
    role: 'button',
    currentState: 'enabled',
  };
  const result = capability.validateControl(invalid);
  assert.equal(result.success, false);
  if (result.success) {
    throw new Error('Expected failure');
  } else {
    assert.equal(result.error.role, 'alert');
    assert.equal(result.error.liveRegion, 'assertive');
  }
});

test('accessibleinteractionuisemantics', () => {
  const control = capability.createControl('c1', 'Name');
  const focused = capability.applyVisibleFocus(control);
  assert.equal(focused.focusVisible, true);

  const controls = [control, capability.createControl('c2', 'Second')];
  const ordered = capability.setFocusOrder(controls);
  assert.equal(ordered[0].focusOrder, 0);
  assert.equal(ordered[1].focusOrder, 1);

  const withAlt = capability.setPreviewAltText(control, 'Preview alt');
  assert.equal(withAlt.previewAltText, 'Preview alt');
});

test('accessibleinteractionvalidation', () => {
  const initial = capability.createControl('c1', 'Name', 'button', 'enabled');
  const customise = (c: capability.InteractiveControl): capability.InteractiveControl => c;
  const exportFn = (c: capability.InteractiveControl): string => c.accessibleName;
  const successResult = capability.exerciseKeyboardPath(initial, customise, exportFn);
  assert.equal(successResult.success, true);
  if (successResult.success) {
    assert.ok(successResult.control.accessibleName);
    assert.ok(successResult.control.role);
  }

  // Failure: missing accessible name
  const invalidName: capability.InteractiveControl = {
    id: 'invalid-name',
    accessibleName: '',
    role: 'button',
    currentState: 'enabled',
  };
  const failNameResult = capability.exerciseKeyboardPath(invalidName, customise, exportFn);
  assert.equal(failNameResult.success, false);
  if (failNameResult.success) {
    throw new Error('Expected failure for missing name');
  } else {
    assert.ok(failNameResult.error.message);
  }

  // Failure: missing role
  const invalidRole: capability.InteractiveControl = {
    id: 'invalid-role',
    accessibleName: 'Name',
    role: '',
    currentState: 'enabled',
  };
  const failRoleResult = capability.exerciseKeyboardPath(invalidRole, customise, exportFn);
  assert.equal(failRoleResult.success, false);
  if (failRoleResult.success) {
    throw new Error('Expected failure for missing role');
  } else {
    assert.ok(failRoleResult.error.message);
  }
});