// accessibleinteraction.ts
// Capability module for accessible interaction in the ANQR product.

// --- Type definitions ---

export interface InteractiveControl {
  readonly id: string;
  readonly accessibleName: string;
  readonly role: string;
  readonly currentState: string;
  readonly focusOrder?: number;
  readonly focusVisible?: boolean;
  readonly tabIndex?: number;
  readonly previewAltText?: string;
}

export interface AccessibleError {
  readonly message: string;
  readonly role: 'alert';
  readonly liveRegion?: 'polite' | 'assertive';
}

export type ControlValidationResult =
  | { readonly success: true; readonly control: InteractiveControl }
  | { readonly success: false; readonly error: AccessibleError };

// --- Constants ---

export const DEFAULT_ROLE = 'button';
export const DEFAULT_STATE = 'enabled';
export const ALERT_ROLE = 'alert' as const;
export const LIVE_REGION_POLITE = 'polite' as const;
export const LIVE_REGION_ASSERTIVE = 'assertive' as const;

// --- Factory functions ---

/**
 * Creates an interactive control with the required accessible properties.
 * The control will have an accessible name, role, and current state.
 */
export function createControl(
  id: string,
  accessibleName: string,
  role: string = DEFAULT_ROLE,
  currentState: string = DEFAULT_STATE
): InteractiveControl {
  if (!id || id.trim() === '') {
    throw new Error('Control id must be a non-empty string.');
  }
  if (!accessibleName || accessibleName.trim() === '') {
    throw new Error('Control accessibleName must be a non-empty string.');
  }
  if (!role || role.trim() === '') {
    throw new Error('Control role must be a non-empty string.');
  }
  if (!currentState || currentState.trim() === '') {
    throw new Error('Control currentState must be a non-empty string.');
  }

  return {
    id,
    accessibleName,
    role,
    currentState,
  };
}

// --- Validation functions ---

/**
 * Validates that a control exposes an accessible name, role, and current state.
 * Returns a discriminated union: success with the control, or failure with an AccessibleError.
 * The error is structured to be announced to assistive technology (role="alert").
 */
export function validateControl(
  control: InteractiveControl
): ControlValidationResult {
  if (!control.accessibleName || control.accessibleName.trim() === '') {
    return {
      success: false,
      error: {
        message: `Control "${control.id}" is missing an accessible name.`,
        role: ALERT_ROLE,
        liveRegion: LIVE_REGION_ASSERTIVE,
      },
    };
  }

  if (!control.role || control.role.trim() === '') {
    return {
      success: false,
      error: {
        message: `Control "${control.id}" is missing a role.`,
        role: ALERT_ROLE,
        liveRegion: LIVE_REGION_ASSERTIVE,
      },
    };
  }

  if (!control.currentState || control.currentState.trim() === '') {
    return {
      success: false,
      error: {
        message: `Control "${control.id}" is missing a current state.`,
        role: ALERT_ROLE,
        liveRegion: LIVE_REGION_ASSERTIVE,
      },
    };
  }

  return { success: true, control };
}

// --- Focus management functions ---

/**
 * Sets the focus order of controls according to the reading order (array index).
 * Returns a new array with updated controls; does not mutate the input.
 */
export function setFocusOrder(
  controls: readonly InteractiveControl[]
): readonly InteractiveControl[] {
  return controls.map((control, index) => ({
    ...control,
    focusOrder: index,
  }));
}

/**
 * Makes focus visible on a control by setting the focusVisible flag.
 * Returns a new control object; does not mutate the input.
 */
export function applyVisibleFocus(
  control: InteractiveControl
): InteractiveControl {
  return {
    ...control,
    focusVisible: true,
  };
}

// --- Preview accessibility function ---

/**
 * Sets a text alternative for an artefact preview control.
 * Returns a new control with the previewAltText property; does not mutate the input.
 */
export function setPreviewAltText(
  control: InteractiveControl,
  altText: string
): InteractiveControl {
  if (!altText || altText.trim() === '') {
    throw new Error('Preview alt text must be a non-empty string.');
  }
  return {
    ...control,
    previewAltText: altText,
  };
}

// --- Keyboard accessibility function ---

/**
 * Ensures a control is keyboard accessible by setting a tabIndex if not already present.
 * Returns a new control with tabIndex set to 0 (focusable via keyboard); does not mutate the input.
 */
export function ensureKeyboardAccessible(
  control: InteractiveControl
): InteractiveControl {
  if (control.tabIndex !== undefined) {
    return control; // Already has a tabIndex; return as-is.
  }
  return {
    ...control,
    tabIndex: 0,
  };
}

// --- Composite workflow function ---

/**
 * Exercises a keyboard-only path through creation, customisation, and export.
 * At each step, the control is validated to ensure it exposes a name and role.
 * If any validation fails, the function returns the failure outcome without proceeding.
 * The mutation functions (customisation, export) are only called if validation succeeds.
 *
 * @param initialControl The starting control (must be already created).
 * @param customise A pure function that takes a control and returns a customised control.
 * @param exportFn A pure function that takes a control and returns an export representation (e.g., string).
 * @returns A ControlValidationResult indicating success (with the final control) or failure (with an AccessibleError).
 */
export function exerciseKeyboardPath(
  initialControl: InteractiveControl,
  customise: (control: InteractiveControl) => InteractiveControl,
  exportFn: (control: InteractiveControl) => string
): ControlValidationResult {
  // Step 1: Validate the initial control.
  const initialValidation = validateControl(initialControl);
  if (!initialValidation.success) {
    return initialValidation;
  }

  // Step 2: Apply customisation (mutation) only after validation passes.
  let currentControl = initialValidation.control;
  currentControl = customise(currentControl);

  // Step 3: Validate the customised control.
  const customisedValidation = validateControl(currentControl);
  if (!customisedValidation.success) {
    return customisedValidation;
  }

  // Step 4: Export (mutation) only after validation passes.
  currentControl = customisedValidation.control;
  exportFn(currentControl); // Export is performed; result is not further validated per requirements.

  // Step 5: Return success with the final control.
  return { success: true, control: currentControl };
}