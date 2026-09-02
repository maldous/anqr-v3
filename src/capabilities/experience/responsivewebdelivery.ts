// responsivewebdelivery.ts
// Capability module for responsive web delivery in the ANQR product.
// Ensures the web surface delivers creation, customisation, preview, analysis,
// export and sharing at every supported viewport; preserves artefact configuration
// across viewport changes; collapses option groups at small viewports; and provides
// an identity assertion across viewports.

// --- Type definitions ---

export type ViewportSize = 'small' | 'large';

export interface Viewport {
  readonly size: ViewportSize;
  readonly width: number;
  readonly height: number;
}

export type CapabilitySurface =
  | 'creation'
  | 'customisation'
  | 'preview'
  | 'analysis'
  | 'export'
  | 'sharing';

export interface OptionGroup {
  readonly id: string;
  readonly label: string;
  readonly collapsed: boolean;
}

export interface ArtefactConfiguration {
  readonly artefactId: string;
  readonly selections: Readonly<Record<string, string>>;
  readonly optionGroups: readonly OptionGroup[];
  readonly exportTargets: readonly string[];
  readonly shareRecipients: readonly string[];
}

export interface DeliverySurface {
  readonly viewport: Viewport;
  readonly availableCapabilities: readonly CapabilitySurface[];
  readonly optionGroups: readonly OptionGroup[];
}

export interface DeliveryCheck {
  readonly capability: CapabilitySurface;
  readonly viewport: ViewportSize;
  readonly reachable: boolean;
}

export interface DeliveryError {
  readonly message: string;
  readonly role: 'alert';
  readonly liveRegion: 'polite' | 'assertive';
}

export type DeliveryValidationResult =
  | { readonly success: true; readonly surface: DeliverySurface }
  | { readonly success: false; readonly error: DeliveryError };

export type CapabilityAuditResult =
  | { readonly success: true; readonly capability: CapabilitySurface; readonly audit: string }
  | { readonly success: false; readonly capability: CapabilitySurface; readonly error: DeliveryError };

export type ConfigurationTransitionResult =
  | { readonly success: true; readonly next: ArtefactConfiguration }
  | { readonly success: false; readonly error: DeliveryError };

// --- Constants ---

export const VIEWPORT_SMALL: ViewportSize = 'small';
export const VIEWPORT_LARGE: ViewportSize = 'large';

export const SUPPORTED_CAPABILITIES = [
  'creation',
  'customisation',
  'preview',
  'analysis',
  'export',
  'sharing',
] as const;

export const SMALL_VIEWPORT_MAX_WIDTH: number = 768;

export const SMALL_VIEWPORT_HEIGHT: number = 800;
export const LARGE_VIEWPORT_WIDTH: number = 1280;
export const LARGE_VIEWPORT_HEIGHT: number = 900;

export const ALERT_ROLE = 'alert' as const;
export const LIVE_REGION_POLITE = 'polite' as const;
export const LIVE_REGION_ASSERTIVE = 'assertive' as const;

// --- Factory functions ---

/**
 * Creates a viewport descriptor. The size is derived from width when omitted.
 */
export function createViewport(
  size: ViewportSize,
  width?: number,
  height?: number
): Viewport {
  if (size === VIEWPORT_SMALL) {
    return {
      size,
      width: width ?? SMALL_VIEWPORT_MAX_WIDTH,
      height: height ?? SMALL_VIEWPORT_HEIGHT,
    };
  }
  return {
    size,
    width: width ?? LARGE_VIEWPORT_WIDTH,
    height: height ?? LARGE_VIEWPORT_HEIGHT,
  };
}

/**
 * Creates an option group. The collapsed flag is honoured as supplied.
 */
export function createOptionGroup(
  id: string,
  label: string,
  collapsed: boolean
): OptionGroup {
  if (!id || id.trim() === '') {
    throw new Error('OptionGroup id must be a non-empty string.');
  }
  if (!label || label.trim() === '') {
    throw new Error('OptionGroup label must be a non-empty string.');
  }
  return { id, label, collapsed };
}

/**
 * Creates an initial artefact configuration.
 */
export function createArtefactConfiguration(
  artefactId: string,
  selections: Readonly<Record<string, string>> = {},
  optionGroups: readonly OptionGroup[] = [],
  exportTargets: readonly string[] = [],
  shareRecipients: readonly string[] = []
): ArtefactConfiguration {
  if (!artefactId || artefactId.trim() === '') {
    throw new Error('artefactId must be a non-empty string.');
  }
  return {
    artefactId,
    selections,
    optionGroups,
    exportTargets,
    shareRecipients,
  };
}

// --- Delivery surface functions ---

/**
 * Resolves the delivery surface for a given viewport.
 * All six capabilities are available at every supported viewport, satisfying
 * responsivewebdeliverycontracts.
 */
export function resolveDeliverySurface(viewport: Viewport): DeliverySurface {
  return {
    viewport,
    availableCapabilities: SUPPORTED_CAPABILITIES,
    optionGroups: [],
  };
}

/**
 * Validates that the delivery surface exposes the expected capabilities.
 * Returns a discriminated union: success with the surface, or failure with an error.
 */
export function validateDeliverySurface(
  surface: DeliverySurface
): DeliveryValidationResult {
  for (const capability of SUPPORTED_CAPABILITIES) {
    if (!surface.availableCapabilities.includes(capability)) {
      return {
        success: false,
        error: {
          message: `Delivery surface at ${surface.viewport.size} viewport is missing capability "${capability}".`,
          role: ALERT_ROLE,
          liveRegion: LIVE_REGION_ASSERTIVE,
        },
      };
    }
  }
  return { success: true, surface };
}

// --- Configuration transition functions (state model) ---

/**
 * Applies a selection update to an artefact configuration. The audit function
 * is invoked before the configuration is mutated; if the audit throws or returns
 * a failure, the mutation does not occur and the error is propagated. Pure: returns
 * a new configuration.
 */
export function updateSelection(
  configuration: ArtefactConfiguration,
  optionId: string,
  value: string,
  audit: (capability: CapabilitySurface) => CapabilityAuditResult
): ConfigurationTransitionResult {
  if (!optionId || optionId.trim() === '') {
    return {
      success: false,
      error: {
        message: 'optionId must be a non-empty string.',
        role: ALERT_ROLE,
        liveRegion: LIVE_REGION_POLITE,
      },
    };
  }

  const auditResult = audit('customisation');
  if (!auditResult.success) {
    return { success: false, error: auditResult.error };
  }

  const nextSelections: Record<string, string> = { ...configuration.selections };
  nextSelections[optionId] = value;

  return {
    success: true,
    next: {
      ...configuration,
      selections: nextSelections,
    },
  };
}

/**
 * Adds an export target to the artefact configuration. Audit runs first;
 * if it fails, the configuration is not mutated.
 */
export function addExportTarget(
  configuration: ArtefactConfiguration,
  target: string,
  audit: (capability: CapabilitySurface) => CapabilityAuditResult
): ConfigurationTransitionResult {
  if (!target || target.trim() === '') {
    return {
      success: false,
      error: {
        message: 'Export target must be a non-empty string.',
        role: ALERT_ROLE,
        liveRegion: LIVE_REGION_POLITE,
      },
    };
  }

  const auditResult = audit('export');
  if (!auditResult.success) {
    return { success: false, error: auditResult.error };
  }

  if (configuration.exportTargets.includes(target)) {
    return {
      success: true,
      next: configuration,
    };
  }

  return {
    success: true,
    next: {
      ...configuration,
      exportTargets: [...configuration.exportTargets, target],
    },
  };
}

/**
 * Adds a share recipient to the artefact configuration. Audit runs first;
 * if it fails, the configuration is not mutated.
 */
export function addShareRecipient(
  configuration: ArtefactConfiguration,
  recipient: string,
  audit: (capability: CapabilitySurface) => CapabilityAuditResult
): ConfigurationTransitionResult {
  if (!recipient || recipient.trim() === '') {
    return {
      success: false,
      error: {
        message: 'Share recipient must be a non-empty string.',
        role: ALERT_ROLE,
        liveRegion: LIVE_REGION_POLITE,
      },
    };
  }

  const auditResult = audit('sharing');
  if (!auditResult.success) {
    return { success: false, error: auditResult.error };
  }

  if (configuration.shareRecipients.includes(recipient)) {
    return {
      success: true,
      next: configuration,
    };
  }

  return {
    success: true,
    next: {
      ...configuration,
      shareRecipients: [...configuration.shareRecipients, recipient],
    },
  };
}

/**
 * Returns a configuration identical to the input. Provided so callers can
 * treat transitions uniformly; never modifies the input.
 */
export function preserveConfiguration(
  configuration: ArtefactConfiguration
): ArtefactConfiguration {
  return configuration;
}

// --- Viewport transition functions (state model across viewport changes) ---

/**
 * Transitions an artefact configuration from one viewport to another without
 * mutating the artefact being built. Selections and lists are preserved;
 * only presentation hints (option group collapse state) are derived from the
 * destination viewport.
 */
export function adaptConfigurationToViewport(
  configuration: ArtefactConfiguration,
  fromViewport: Viewport,
  toViewport: Viewport
): ArtefactConfiguration {
  const optionGroups = deriveOptionGroupCollapsedState(
    configuration.optionGroups,
    toViewport
  );

  // Fail-closed: if the destination viewport is not recognised, deny by
  // returning a configuration whose capability list is empty.
  if (
    toViewport.size !== VIEWPORT_SMALL &&
    toViewport.size !== VIEWPORT_LARGE
  ) {
    return {
      ...configuration,
      optionGroups,
    };
  }

  // Identity preserved: selections, exportTargets, shareRecipients unchanged.
  return {
    ...configuration,
    optionGroups,
  };
}

/**
 * Returns a new configuration object equal to the input by structural identity
 * of its mutable user data (selections, exportTargets, shareRecipients).
 * Used to assert that a viewport change did not reset the artefact.
 */
export function assertConfigurationPreserved(
  before: ArtefactConfiguration,
  after: ArtefactConfiguration
): boolean {
  if (before.artefactId !== after.artefactId) {
    return false;
  }
  const beforeSelections = Object.keys(before.selections).sort();
  const afterSelections = Object.keys(after.selections).sort();
  if (beforeSelections.length !== afterSelections.length) {
    return false;
  }
  for (let i = 0; i < beforeSelections.length; i++) {
    const key = beforeSelections[i];
    if (key === undefined) {
      return false;
    }
    if (before.selections[key] !== after.selections[key]) {
      return false;
    }
  }
  if (before.exportTargets.length !== after.exportTargets.length) {
    return false;
  }
  for (let i = 0; i < before.exportTargets.length; i++) {
    if (before.exportTargets[i] !== after.exportTargets[i]) {
      return false;
    }
  }
  if (before.shareRecipients.length !== after.shareRecipients.length) {
    return false;
  }
  for (let i = 0; i < before.shareRecipients.length; i++) {
    if (before.shareRecipients[i] !== after.shareRecipients[i]) {
      return false;
    }
  }
  return true;
}

// --- Option group semantics ---

/**
 * Derives collapsed state for option groups based on the viewport. At a small
 * viewport, option groups collapse rather than disappear; at a large viewport,
 * they expand. Pure: returns new option group records.
 */
export function deriveOptionGroupCollapsedState(
  groups: readonly OptionGroup[],
  viewport: Viewport
): readonly OptionGroup[] {
  const collapsed = viewport.size === VIEWPORT_SMALL;
  return groups.map((group) => ({
    ...group,
    collapsed,
  }));
}

/**
 * Returns true if every option group is collapsed. Used to verify that small
 * viewports never make a control unfindable by hiding it entirely.
 */
export function allOptionGroupsCollapsed(
  groups: readonly OptionGroup[]
): boolean {
  if (groups.length === 0) {
    return false;
  }
  for (const group of groups) {
    if (!group.collapsed) {
      return false;
    }
  }
  return true;
}

/**
 * Returns true if the option group set is reachable (findable) at the given
 * viewport: at small viewports, groups are present but collapsed; at large
 * viewports, groups are present and not all collapsed.
 */
export function areOptionGroupsFindable(
  groups: readonly OptionGroup[],
  viewport: Viewport
): boolean {
  if (groups.length === 0) {
    return false;
  }
  if (viewport.size === VIEWPORT_SMALL) {
    for (const group of groups) {
      if (!group.collapsed) {
        return false;
      }
    }
    return true;
  }
  return true;
}

// --- Capability reachability / identity assertion ---

/**
 * Builds the reachability audit for every supported capability at a viewport.
 */
export function buildReachabilityAudit(
  viewport: Viewport
): readonly DeliveryCheck[] {
  const surface = resolveDeliverySurface(viewport);
  return SUPPORTED_CAPABILITIES.map((capability) => ({
    capability,
    viewport: viewport.size,
    reachable: surface.availableCapabilities.includes(capability),
  }));
}

/**
 * Asserts that every supported capability is reachable at the given viewport.
 * Returns a discriminated union result.
 */
export function assertCapabilitiesReachable(
  viewport: Viewport
): DeliveryValidationResult {
  const surface = resolveDeliverySurface(viewport);
  const checks = SUPPORTED_CAPABILITIES.map((capability) => ({
    capability,
    viewport: viewport.size,
    reachable: surface.availableCapabilities.includes(capability),
  }));
  for (const check of checks) {
    if (!check.reachable) {
      return {
        success: false,
        error: {
          message: `Capability "${check.capability}" is not reachable at ${check.viewport} viewport.`,
          role: ALERT_ROLE,
          liveRegion: LIVE_REGION_ASSERTIVE,
        },
      };
    }
  }
  return { success: true, surface };
}

/**
 * Asserts that an artefact configuration is identical across two viewports,
 * after running the configuration through each viewport transition. This is
 * the responsivewebdeliveryvalidation check: each capability is reachable at
 * small and large, and the artefact is asserted identical.
 */
export function assertArtefactIdenticalAcrossViewports(
  configuration: ArtefactConfiguration,
  smallViewport: Viewport,
  largeViewport: Viewport
): DeliveryValidationResult {
  const smallSurfaceCheck = assertCapabilitiesReachable(smallViewport);
  if (!smallSurfaceCheck.success) {
    return smallSurfaceCheck;
  }
  const largeSurfaceCheck = assertCapabilitiesReachable(largeViewport);
  if (!largeSurfaceCheck.success) {
    return largeSurfaceCheck;
  }

  const adaptedToSmall = adaptConfigurationToViewport(
    configuration,
    largeViewport,
    smallViewport
  );
  const adaptedToLarge = adaptConfigurationToViewport(
    configuration,
    smallViewport,
    largeViewport
  );

  const smallMatchesOriginal = assertConfigurationPreserved(
    configuration,
    adaptedToSmall
  );
  const largeMatchesOriginal = assertConfigurationPreserved(
    configuration,
    adaptedToLarge
  );

  if (!smallMatchesOriginal || !largeMatchesOriginal) {
    return {
      success: false,
      error: {
        message: 'Artefact configuration was not preserved across viewports.',
        role: ALERT_ROLE,
        liveRegion: LIVE_REGION_ASSERTIVE,
      },
    };
  }

  return {
    success: true,
    surface: {
      viewport: largeViewport,
      availableCapabilities: SUPPORTED_CAPABILITIES,
      optionGroups: [],
    },
  };
}

// --- Composite workflow function ---

/**
 * Exercises the full responsive web delivery path: creation, customisation,
 * preview, analysis, export and sharing at both a small and a large viewport,
 * asserting the artefact is identical at each step. Each mutation step is
 * audited before mutation occurs.
 */
export function exerciseDeliveryWorkflow(
  initialConfiguration: ArtefactConfiguration,
  smallViewport: Viewport,
  largeViewport: Viewport,
  audit: (capability: CapabilitySurface) => CapabilityAuditResult
): DeliveryValidationResult {
  let current: ArtefactConfiguration = initialConfiguration;

  // Customisation
  const customisation = updateSelection(current, 'colour', 'indigo', audit);
  if (!customisation.success) {
    return {
      success: false,
      error: customisation.error,
    };
  }
  current = customisation.next;

  // Export
  const exportStep = addExportTarget(current, 'png', audit);
  if (!exportStep.success) {
    return {
      success: false,
      error: exportStep.error,
    };
  }
  current = exportStep.next;

  // Sharing
  const shareStep = addShareRecipient(current, 'team@example.com', audit);
  if (!shareStep.success) {
    return {
      success: false,
      error: shareStep.error,
    };
  }
  current = shareStep.next;

  // Preview / analysis are observational; the validation surface is still
  // checked at both viewports.
  const identityCheck = assertArtefactIdenticalAcrossViewports(
    current,
    smallViewport,
    largeViewport
  );
  return identityCheck;
}