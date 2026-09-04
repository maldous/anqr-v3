import assert from 'node:assert/strict';
import test from 'node:test';
import * as capability from '../../../src/capabilities/experience/responsivewebdelivery.ts';

import { existsSync } from "node:fs";
import { architectureReport, distMain, facetVerdict, runScript } from "../architecture-verdict.ts";


test('responsivewebdeliverycontracts', () => {
  const smallViewport = capability.createViewport(capability.VIEWPORT_SMALL);
  const largeViewport = capability.createViewport(capability.VIEWPORT_LARGE);

  const smallSurface = capability.resolveDeliverySurface(smallViewport);
  const largeSurface = capability.resolveDeliverySurface(largeViewport);

  for (const cap of capability.SUPPORTED_CAPABILITIES) {
    assert.ok(
      smallSurface.availableCapabilities.includes(cap),
      `Small viewport missing capability: ${cap}`
    );
    assert.ok(
      largeSurface.availableCapabilities.includes(cap),
      `Large viewport missing capability: ${cap}`
    );
  }

  const smallValidation = capability.validateDeliverySurface(smallSurface);
  const largeValidation = capability.validateDeliverySurface(largeSurface);
  assert.ok(smallValidation.success, 'Small viewport validation failed');
  assert.ok(largeValidation.success, 'Large viewport validation failed');
});

test('responsivewebdeliverystatemodel', () => {
  const artefact = capability.createArtefactConfiguration(
    'art-1',
    { colour: 'red', size: 'large' },
    [capability.createOptionGroup('group1', 'Group 1', false)],
    ['png', 'pdf'],
    ['alice@example.com', 'bob@example.com']
  );

  const smallViewport = capability.createViewport(capability.VIEWPORT_SMALL);
  const largeViewport = capability.createViewport(capability.VIEWPORT_LARGE);

  const adaptedToSmall = capability.adaptConfigurationToViewport(
    artefact,
    largeViewport,
    smallViewport
  );
  const adaptedToLarge = capability.adaptConfigurationToViewport(
    artefact,
    smallViewport,
    largeViewport
  );

  assert.ok(
    capability.assertConfigurationPreserved(artefact, adaptedToSmall),
    'Configuration not preserved when adapting to small'
  );
  assert.ok(
    capability.assertConfigurationPreserved(artefact, adaptedToLarge),
    'Configuration not preserved when adapting to large'
  );

  // Option groups must be present (not disappeared) and collapsed at small
  assert.equal(adaptedToSmall.optionGroups.length, artefact.optionGroups.length);
  for (const group of adaptedToSmall.optionGroups) {
    assert.ok(group.collapsed, 'Option group not collapsed at small viewport');
  }

  // At large, option groups should be expanded (not collapsed)
  for (const group of adaptedToLarge.optionGroups) {
    assert.ok(!group.collapsed, 'Option group collapsed at large viewport');
  }
});

test('responsivewebdeliveryuisemantics', () => {
  const optionGroups = [
    capability.createOptionGroup('g1', 'Group 1', false),
    capability.createOptionGroup('g2', 'Group 2', false),
  ];
  const smallViewport = capability.createViewport(capability.VIEWPORT_SMALL);
  const largeViewport = capability.createViewport(capability.VIEWPORT_LARGE);

  const collapsedAtSmall = capability.deriveOptionGroupCollapsedState(
    optionGroups,
    smallViewport
  );
  const collapsedAtLarge = capability.deriveOptionGroupCollapsedState(
    optionGroups,
    largeViewport
  );

  // At small viewport: all groups collapsed, but still present and findable
  assert.ok(
    capability.allOptionGroupsCollapsed(collapsedAtSmall),
    'Not all option groups collapsed at small viewport'
  );
  assert.equal(collapsedAtSmall.length, optionGroups.length);
  assert.ok(
    capability.areOptionGroupsFindable(collapsedAtSmall, smallViewport),
    'Option groups not findable at small viewport'
  );

  // At large viewport: groups are expanded (not all collapsed) and findable
  assert.ok(
    !capability.allOptionGroupsCollapsed(collapsedAtLarge),
    'All option groups collapsed at large viewport'
  );
  assert.ok(
    capability.areOptionGroupsFindable(collapsedAtLarge, largeViewport),
    'Option groups not findable at large viewport'
  );
});

test('responsivewebdeliveryvalidation', () => {
  const artefact = capability.createArtefactConfiguration(
    'art-2',
    { theme: 'dark' },
    [capability.createOptionGroup('g1', 'Group 1', false)],
    ['csv'],
    ['user@example.com']
  );

  const smallViewport = capability.createViewport(capability.VIEWPORT_SMALL);
  const largeViewport = capability.createViewport(capability.VIEWPORT_LARGE);

  const result = capability.assertArtefactIdenticalAcrossViewports(
    artefact,
    smallViewport,
    largeViewport
  );
  assert.ok(result.success, 'Artefact not identical across viewports');
});
test("architecturedeclareddependenciesagree", () => {
  // The manifest, the lockfile and the resolved imports agree, so a build on
  // another machine resolves what this one resolved.
  const { verdict, findings } = facetVerdict("architecturedeclareddependenciesagree");
  assert.deepEqual(findings, [], "an undeclared or unused dependency would appear here");
  assert.equal(verdict, "satisfied");
});

test("architectureexperiencetraceability", () => {
  // Every rendered action resolves to declared authority and every declared
  // action reaches a component that renders it. Both directions.
  const { verdict, findings } = facetVerdict("architectureexperiencetraceability");
  assert.deepEqual(findings, [], "an unbound rendered action or an unimplemented declared action would appear here");
  assert.equal(verdict, "satisfied");
});

test("architecturestatictypecorrectness", () => {
  // No static check decides this one, so the type checker is run.
  const result = runScript("typecheck");
  assert.equal(result.ok, true, `tsc must be clean:\n${result.output}`);
});

test("architecturebuildcorrectness", () => {
  // Nor this one: the declared build must resolve every production import and
  // produce the declared artefact.
  const result = runScript("build");
  assert.equal(result.ok, true, `the declared build must succeed:\n${result.output}`);
  assert.match(result.output, /bundle apps\/web\/dist\/main\.js/u);
  assert.equal(existsSync(distMain), true, "the declared artefact must exist");
});
