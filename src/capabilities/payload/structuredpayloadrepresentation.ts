import * as crypto from 'node:crypto';

// --- Type definitions ---

export type PayloadKind =
  | 'plain_text'
  | 'url'
  | 'tel'
  | 'email'
  | 'sms'
  | 'geo'
  | 'vcard'
  | 'mecard'
  | 'bizcard'
  | 'wifi'
  | 'app_link'
  | 'event'
  | 'event_rsvp'
  | 'calendar_subscription'
  | 'social_profile'
  | 'messaging_link'
  | 'short_link'
  | 'utm_link'
  | 'custom'
  | 'payment'
  | 'product_identity';

export const PAYLOAD_KINDS: readonly PayloadKind[] = [
  'plain_text',
  'url',
  'tel',
  'email',
  'sms',
  'geo',
  'vcard',
  'mecard',
  'bizcard',
  'wifi',
  'app_link',
  'event',
  'event_rsvp',
  'calendar_subscription',
  'social_profile',
  'messaging_link',
  'short_link',
  'utm_link',
  'custom',
  'payment',
  'product_identity',
] as const;

export interface PayloadField {
  readonly name: string;
  readonly label: string;
  readonly required: boolean;
  readonly description: string;
}

export interface PayloadSchema {
  readonly kind: PayloadKind;
  readonly fields: readonly PayloadField[];
}

export type ErrorIdentifier =
  | 'structuredpayloadrepresentation:field_error'
  | 'structuredpayloadrepresentation:format_error'
  | 'structuredpayloadrepresentation:unknown_kind'
  | 'structuredpayloadrepresentation:undeclared_field';

export const ERROR_IDENTIFIERS: readonly ErrorIdentifier[] = [
  'structuredpayloadrepresentation:field_error',
  'structuredpayloadrepresentation:format_error',
  'structuredpayloadrepresentation:unknown_kind',
  'structuredpayloadrepresentation:undeclared_field',
] as const;

export type StateIdentifier = 'structuredpayloadrepresentation:state';

export const STATE_IDENTIFIERS: readonly StateIdentifier[] = [
  'structuredpayloadrepresentation:state',
] as const;

export interface PayloadFieldError {
  readonly kind: 'field_error';
  readonly identifier: 'structuredpayloadrepresentation:field_error';
  readonly field: string;
  readonly reason: string;
}

export interface PayloadFormatError {
  readonly kind: 'format_error';
  readonly identifier: 'structuredpayloadrepresentation:format_error';
  readonly field: string;
  readonly reason: string;
}

export interface PayloadUnknownKindError {
  readonly kind: 'unknown_kind';
  readonly identifier: 'structuredpayloadrepresentation:unknown_kind';
  readonly field: string;
  readonly reason: string;
}

export interface PayloadUndeclaredFieldError {
  readonly kind: 'undeclared_field';
  readonly identifier: 'structuredpayloadrepresentation:undeclared_field';
  readonly field: string;
  readonly reason: string;
}

export type PayloadError =
  | PayloadFieldError
  | PayloadFormatError
  | PayloadUnknownKindError
  | PayloadUndeclaredFieldError;

export type PayloadValidationResult =
  | { readonly success: true; readonly kind: PayloadKind }
  | { readonly success: false; readonly error: PayloadError };

export interface Payload {
  readonly kind: PayloadKind;
  readonly values: Readonly<Record<string, string>>;
}

export interface PresentationOptions {
  readonly foregroundColor: string;
  readonly backgroundColor: string;
  readonly moduleSize: 'small' | 'medium' | 'large';
  readonly errorCorrection: 'L' | 'M' | 'Q' | 'H';
  readonly logo?: string;
}

export interface PayloadState {
  readonly identifier: 'structuredpayloadrepresentation:state';
  readonly presentation: PresentationOptions;
  readonly payload: Payload;
}

export type PayloadStateUpdateResult =
  | { readonly success: true; readonly state: PayloadState }
  | { readonly success: false; readonly error: PayloadError };

export interface ClassificationResult {
  readonly success: true;
  readonly kind: PayloadKind;
  readonly matches: readonly PayloadKind[];
}

// --- Constants ---

export const DEFAULT_FOREGROUND = '#000000';
export const DEFAULT_BACKGROUND = '#FFFFFF';
export const DEFAULT_MODULE_SIZE = 'medium' as const;
export const DEFAULT_ERROR_CORRECTION = 'M' as const;

// --- Field schemas ---

function fieldsOf(
  defs: ReadonlyArray<readonly [string, string, boolean, string]>
): readonly PayloadField[] {
  return defs.map(
    ([name, label, required, description]): PayloadField => ({
      name,
      label,
      required,
      description,
    })
  );
}

const PLAIN_TEXT_FIELDS: readonly PayloadField[] = fieldsOf([
  ['text', 'Text', true, 'The plain text content.'],
]);

const URL_FIELDS: readonly PayloadField[] = fieldsOf([
  ['url', 'URL', true, 'The destination URL.'],
]);

const TEL_FIELDS: readonly PayloadField[] = fieldsOf([
  ['number', 'Phone number', true, 'The telephone number.'],
]);

const EMAIL_FIELDS: readonly PayloadField[] = fieldsOf([
  ['address', 'Email address', true, 'The email address.'],
  ['subject', 'Subject', false, 'Optional email subject.'],
  ['body', 'Body', false, 'Optional email body.'],
]);

const SMS_FIELDS: readonly PayloadField[] = fieldsOf([
  ['number', 'Phone number', true, 'The recipient phone number.'],
  ['message', 'Message', false, 'Optional SMS message body.'],
]);

const GEO_FIELDS: readonly PayloadField[] = fieldsOf([
  ['latitude', 'Latitude', true, 'Latitude in decimal degrees.'],
  ['longitude', 'Longitude', true, 'Longitude in decimal degrees.'],
]);

const VCARD_FIELDS: readonly PayloadField[] = fieldsOf([
  ['name', 'Full name', true, 'Contact full name.'],
  ['organization', 'Organization', false, 'Organization name.'],
  ['title', 'Title', false, 'Job title.'],
  ['phone', 'Phone', false, 'Phone number.'],
  ['email', 'Email', false, 'Email address.'],
  ['url', 'URL', false, 'Website URL.'],
  ['address', 'Address', false, 'Postal address.'],
]);

const MECARD_FIELDS: readonly PayloadField[] = fieldsOf([
  ['name', 'Name', true, 'Contact name.'],
  ['phone', 'Phone', false, 'Phone number.'],
  ['email', 'Email', false, 'Email address.'],
  ['url', 'URL', false, 'Website URL.'],
  ['address', 'Address', false, 'Postal address.'],
]);

const BIZCARD_FIELDS: readonly PayloadField[] = fieldsOf([
  ['name', 'Name', true, 'Contact name.'],
  ['company', 'Company', true, 'Company name.'],
  ['title', 'Title', false, 'Job title.'],
  ['phone', 'Phone', false, 'Phone number.'],
  ['email', 'Email', false, 'Email address.'],
  ['url', 'URL', false, 'Website URL.'],
  ['address', 'Address', false, 'Postal address.'],
]);

const WIFI_FIELDS: readonly PayloadField[] = fieldsOf([
  ['ssid', 'SSID', true, 'Network name.'],
  ['password', 'Password', false, 'Network password.'],
  ['security', 'Security', true, 'Security type (WPA, WEP, nopass).'],
  ['hidden', 'Hidden', false, 'Whether the SSID is hidden (true/false).'],
]);

const APP_LINK_FIELDS: readonly PayloadField[] = fieldsOf([
  ['platform', 'Platform', true, 'Target platform (ios, android, web).'],
  ['url', 'URL', true, 'The destination URL.'],
  ['fallback', 'Fallback URL', false, 'URL to fall back to if app is unavailable.'],
]);

const EVENT_FIELDS: readonly PayloadField[] = fieldsOf([
  ['title', 'Title', true, 'Event title.'],
  ['start', 'Start', true, 'Event start date/time.'],
  ['end', 'End', false, 'Event end date/time.'],
  ['location', 'Location', false, 'Event location.'],
  ['description', 'Description', false, 'Event description.'],
]);

const EVENT_RSVP_FIELDS: readonly PayloadField[] = fieldsOf([
  ['event_id', 'Event ID', true, 'Identifier of the event to RSVP to.'],
  ['response', 'Response', true, 'RSVP response (yes, no, maybe).'],
]);

const CALENDAR_SUB_FIELDS: readonly PayloadField[] = fieldsOf([
  ['url', 'URL', true, 'Calendar subscription URL.'],
]);

const SOCIAL_PROFILE_FIELDS: readonly PayloadField[] = fieldsOf([
  ['network', 'Network', true, 'Social network name.'],
  ['username', 'Username', true, 'Profile username.'],
]);

const MESSAGING_LINK_FIELDS: readonly PayloadField[] = fieldsOf([
  ['service', 'Service', true, 'Messaging service identifier.'],
  ['handle', 'Handle', true, 'Recipient handle or phone number.'],
]);

const SHORT_LINK_FIELDS: readonly PayloadField[] = fieldsOf([
  ['url', 'URL', true, 'The short link URL.'],
]);

const UTM_LINK_FIELDS: readonly PayloadField[] = fieldsOf([
  ['url', 'URL', true, 'The destination URL.'],
  ['source', 'UTM source', true, 'UTM source parameter.'],
  ['medium', 'UTM medium', true, 'UTM medium parameter.'],
  ['campaign', 'UTM campaign', true, 'UTM campaign parameter.'],
]);

const CUSTOM_FIELDS: readonly PayloadField[] = fieldsOf([
  ['content', 'Content', true, 'Custom payload content.'],
]);

const PAYMENT_FIELDS: readonly PayloadField[] = fieldsOf([
  ['scheme', 'Scheme', true, 'Payment scheme identifier.'],
  ['address', 'Address', true, 'Payment address or identifier.'],
  ['amount', 'Amount', false, 'Payment amount.'],
  ['currency', 'Currency', false, 'Payment currency code.'],
]);

const PRODUCT_IDENTITY_FIELDS: readonly PayloadField[] = fieldsOf([
  ['code', 'Code', true, 'Product code (EAN, UPC, etc.).'],
  ['format', 'Format', true, 'Barcode format.'],
]);

const SCHEMAS: Readonly<Record<PayloadKind, readonly PayloadField[]>> = {
  plain_text: PLAIN_TEXT_FIELDS,
  url: URL_FIELDS,
  tel: TEL_FIELDS,
  email: EMAIL_FIELDS,
  sms: SMS_FIELDS,
  geo: GEO_FIELDS,
  vcard: VCARD_FIELDS,
  mecard: MECARD_FIELDS,
  bizcard: BIZCARD_FIELDS,
  wifi: WIFI_FIELDS,
  app_link: APP_LINK_FIELDS,
  event: EVENT_FIELDS,
  event_rsvp: EVENT_RSVP_FIELDS,
  calendar_subscription: CALENDAR_SUB_FIELDS,
  social_profile: SOCIAL_PROFILE_FIELDS,
  messaging_link: MESSAGING_LINK_FIELDS,
  short_link: SHORT_LINK_FIELDS,
  utm_link: UTM_LINK_FIELDS,
  custom: CUSTOM_FIELDS,
  payment: PAYMENT_FIELDS,
  product_identity: PRODUCT_IDENTITY_FIELDS,
};

// --- Presentation ---

export function createPresentation(
  foregroundColor: string = DEFAULT_FOREGROUND,
  backgroundColor: string = DEFAULT_BACKGROUND,
  moduleSize: 'small' | 'medium' | 'large' = DEFAULT_MODULE_SIZE,
  errorCorrection: 'L' | 'M' | 'Q' | 'H' = DEFAULT_ERROR_CORRECTION
): PresentationOptions {
  if (!foregroundColor || foregroundColor.trim() === '') {
    throw new Error('Foreground color must be a non-empty string.');
  }
  if (!backgroundColor || backgroundColor.trim() === '') {
    throw new Error('Background color must be a non-empty string.');
  }
  if (!moduleSize) {
    throw new Error('Module size must be defined.');
  }
  if (!errorCorrection) {
    throw new Error('Error correction must be defined.');
  }
  const result: PresentationOptions = {
    foregroundColor,
    backgroundColor,
    moduleSize,
    errorCorrection,
  };
  return result;
}

export function withPresentation(
  state: PayloadState,
  update: (p: PresentationOptions) => PresentationOptions,
  audit?: (before: PresentationOptions, after: PresentationOptions) => void
): PayloadState {
  const before = state.presentation;
  const next = update(before);
  if (audit !== undefined) {
    audit(before, next);
  }
  return {
    identifier: 'structuredpayloadrepresentation:state',
    presentation: next,
    payload: state.payload,
  };
}

// --- Schemas ---

export function getPayloadSchema(kind: PayloadKind): PayloadSchema {
  return { kind, fields: SCHEMAS[kind] };
}

export function getFieldsForKind(kind: PayloadKind): readonly PayloadField[] {
  return SCHEMAS[kind];
}

// --- Validation ---

const URL_PATTERN = /^https?:\/\/[^\s]+$/i;
const TEL_PATTERN = /^\+?[0-9\s\-()]{3,20}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LATITUDE_PATTERN = /^-?\d+(\.\d+)?$/;
const LONGITUDE_PATTERN = /^-?\d+(\.\d+)?$/;
const GEO_LAT_RANGE = (n: number): boolean => n >= -90 && n <= 90;
const GEO_LON_RANGE = (n: number): boolean => n >= -180 && n <= 180;
const DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/;

function validateField(
  kind: PayloadKind,
  field: PayloadField,
  value: string | undefined
): PayloadError | null {
  if (value === undefined || value === '') {
    if (field.required) {
      const error: PayloadFieldError = {
        kind: 'field_error',
        identifier: 'structuredpayloadrepresentation:field_error',
        field: field.name,
        reason: `Missing required field "${field.label}" for ${kind} payload.`,
      };
      return error;
    }
    return null;
  }

  switch (field.name) {
    case 'url':
      if (!URL_PATTERN.test(value)) {
        const error: PayloadFormatError = {
          kind: 'format_error',
          identifier: 'structuredpayloadrepresentation:format_error',
          field: field.name,
          reason: `Invalid URL format for "${field.label}".`,
        };
        return error;
      }
      break;
    case 'number':
    case 'phone':
      if (!TEL_PATTERN.test(value)) {
        const error: PayloadFormatError = {
          kind: 'format_error',
          identifier: 'structuredpayloadrepresentation:format_error',
          field: field.name,
          reason: `Invalid telephone format for "${field.label}".`,
        };
        return error;
      }
      break;
    case 'email':
      if (!EMAIL_PATTERN.test(value)) {
        const error: PayloadFormatError = {
          kind: 'format_error',
          identifier: 'structuredpayloadrepresentation:format_error',
          field: field.name,
          reason: `Invalid email format for "${field.label}".`,
        };
        return error;
      }
      break;
    case 'latitude':
      if (!LATITUDE_PATTERN.test(value) || !GEO_LAT_RANGE(Number(value))) {
        const error: PayloadFormatError = {
          kind: 'format_error',
          identifier: 'structuredpayloadrepresentation:format_error',
          field: field.name,
          reason: `Latitude must be a number between -90 and 90.`,
        };
        return error;
      }
      break;
    case 'longitude':
      if (!LONGITUDE_PATTERN.test(value) || !GEO_LON_RANGE(Number(value))) {
        const error: PayloadFormatError = {
          kind: 'format_error',
          identifier: 'structuredpayloadrepresentation:format_error',
          field: field.name,
          reason: `Longitude must be a number between -180 and 180.`,
        };
        return error;
      }
      break;
    case 'security':
      if (value !== 'WPA' && value !== 'WEP' && value !== 'nopass') {
        const error: PayloadFormatError = {
          kind: 'format_error',
          identifier: 'structuredpayloadrepresentation:format_error',
          field: field.name,
          reason: `Security must be one of WPA, WEP, nopass.`,
        };
        return error;
      }
      break;
    case 'hidden':
      if (value !== 'true' && value !== 'false') {
        const error: PayloadFormatError = {
          kind: 'format_error',
          identifier: 'structuredpayloadrepresentation:format_error',
          field: field.name,
          reason: `Hidden must be "true" or "false".`,
        };
        return error;
      }
      break;
    case 'platform':
      if (value !== 'ios' && value !== 'android' && value !== 'web') {
        const error: PayloadFormatError = {
          kind: 'format_error',
          identifier: 'structuredpayloadrepresentation:format_error',
          field: field.name,
          reason: `Platform must be one of ios, android, web.`,
        };
        return error;
      }
      break;
    case 'response':
      if (value !== 'yes' && value !== 'no' && value !== 'maybe') {
        const error: PayloadFormatError = {
          kind: 'format_error',
          identifier: 'structuredpayloadrepresentation:format_error',
          field: field.name,
          reason: `Response must be one of yes, no, maybe.`,
        };
        return error;
      }
      break;
    case 'start':
    case 'end':
      if (!DATETIME_PATTERN.test(value)) {
        const error: PayloadFormatError = {
          kind: 'format_error',
          identifier: 'structuredpayloadrepresentation:format_error',
          field: field.name,
          reason: `Date/time must be ISO-like (YYYY-MM-DD or YYYY-MM-DDThh:mm:ss).`,
        };
        return error;
      }
      break;
    case 'currency':
      if (!/^[A-Z]{3}$/.test(value)) {
        const error: PayloadFormatError = {
          kind: 'format_error',
          identifier: 'structuredpayloadrepresentation:format_error',
          field: field.name,
          reason: `Currency must be a three-letter ISO 4217 code.`,
        };
        return error;
      }
      break;
    case 'amount':
      if (!/^-?\d+(\.\d+)?$/.test(value)) {
        const error: PayloadFormatError = {
          kind: 'format_error',
          identifier: 'structuredpayloadrepresentation:format_error',
          field: field.name,
          reason: `Amount must be a decimal number.`,
        };
        return error;
      }
      break;
    case 'format':
      if (
        value !== 'EAN13' &&
        value !== 'EAN8' &&
        value !== 'UPCA' &&
        value !== 'UPCE' &&
        value !== 'CODE128' &&
        value !== 'CODE39'
      ) {
        const error: PayloadFormatError = {
          kind: 'format_error',
          identifier: 'structuredpayloadrepresentation:format_error',
          field: field.name,
          reason: `Format must be a recognised barcode format.`,
        };
        return error;
      }
      break;
    default:
      break;
  }
  return null;
}

export function validatePayload(payload: Payload): PayloadValidationResult {
  const fields = SCHEMAS[payload.kind];
  for (const field of fields) {
    const value = payload.values[field.name];
    const err = validateField(payload.kind, field, value);
    if (err !== null) {
      return { success: false, error: err };
    }
  }
  return { success: true, kind: payload.kind };
}

// --- Payload construction ---

export function createEmptyPayload(kind: PayloadKind): Payload {
  return { kind, values: {} };
}

export function setField(
  payload: Payload,
  name: string,
  value: string,
  audit?: (before: Payload, after: Payload) => void
): Payload {
  const before: Payload = payload;
  const values: Record<string, string> = { ...payload.values, [name]: value };
  const after: Payload = { kind: payload.kind, values };
  if (audit !== undefined) {
    audit(before, after);
  }
  return after;
}

// --- State management ---

export function createPayloadState(
  presentation: PresentationOptions,
  payload: Payload
): PayloadState {
  return {
    identifier: 'structuredpayloadrepresentation:state',
    presentation,
    payload,
  };
}

export function selectKind(
  state: PayloadState,
  kind: PayloadKind,
  audit?: (before: Payload, after: Payload) => void
): PayloadStateUpdateResult {
  if (!isPayloadKind(kind)) {
    const error: PayloadUnknownKindError = {
      kind: 'unknown_kind',
      identifier: 'structuredpayloadrepresentation:unknown_kind',
      field: 'kind',
      reason: `Unknown payload kind.`,
    };
    return { success: false, error };
  }
  const next: Payload = { kind, values: {} };
  if (audit !== undefined) {
    audit(state.payload, next);
  }
  return {
    success: true,
    state: {
      identifier: 'structuredpayloadrepresentation:state',
      presentation: state.presentation,
      payload: next,
    },
  };
}

export function applyFieldValue(
  state: PayloadState,
  fieldName: string,
  value: string,
  audit?: (before: Payload, after: Payload) => void
): PayloadStateUpdateResult {
  const fields = SCHEMAS[state.payload.kind];
  const field = fields.find((f) => f.name === fieldName);
  if (field === undefined) {
    const error: PayloadUndeclaredFieldError = {
      kind: 'undeclared_field',
      identifier: 'structuredpayloadrepresentation:undeclared_field',
      field: fieldName,
      reason: `Field "${fieldName}" is not declared for kind "${state.payload.kind}".`,
    };
    return { success: false, error };
  }

  const validation = validateField(state.payload.kind, field, value);
  if (validation !== null) {
    return { success: false, error: validation };
  }

  const candidate: Payload = {
    kind: state.payload.kind,
    values: { ...state.payload.values, [fieldName]: value },
  };

  if (audit !== undefined) {
    audit(state.payload, candidate);
  }
  return {
    success: true,
    state: {
      identifier: 'structuredpayloadrepresentation:state',
      presentation: state.presentation,
      payload: candidate,
    },
  };
}

export function isPayloadKind(value: string): value is PayloadKind {
  return (PAYLOAD_KINDS as readonly string[]).includes(value);
}

// --- Encoding (pure, deterministic) ---

export function encodePayload(payload: Payload): string {
  switch (payload.kind) {
    case 'plain_text':
      return payload.values['text'] ?? '';
    case 'url':
      return payload.values['url'] ?? '';
    case 'tel':
      return `tel:${payload.values['number'] ?? ''}`;
    case 'email':
      return `mailto:${payload.values['address'] ?? ''}`;
    case 'sms':
      return `smsto:${payload.values['number'] ?? ''}:${payload.values['message'] ?? ''}`;
    case 'geo':
      return `geo:${payload.values['latitude'] ?? ''},${payload.values['longitude'] ?? ''}`;
    case 'vcard':
      return [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `FN:${payload.values['name'] ?? ''}`,
        `ORG:${payload.values['organization'] ?? ''}`,
        `TITLE:${payload.values['title'] ?? ''}`,
        `TEL:${payload.values['phone'] ?? ''}`,
        `EMAIL:${payload.values['email'] ?? ''}`,
        `URL:${payload.values['url'] ?? ''}`,
        `ADR:${payload.values['address'] ?? ''}`,
        'END:VCARD',
      ].join('\n');
    case 'mecard':
      return [
        'MECARD:',
        `N:${payload.values['name'] ?? ''};`,
        `TEL:${payload.values['phone'] ?? ''};`,
        `EMAIL:${payload.values['email'] ?? ''};`,
        `URL:${payload.values['url'] ?? ''};`,
        `ADR:${payload.values['address'] ?? ''};`,
        ';',
      ].join('');
    case 'bizcard':
      return [
        'BIZCARD:',
        `N:${payload.values['name'] ?? ''};`,
        `CO:${payload.values['company'] ?? ''};`,
        `T:${payload.values['title'] ?? ''};`,
        `TEL:${payload.values['phone'] ?? ''};`,
        `EMAIL:${payload.values['email'] ?? ''};`,
        `URL:${payload.values['url'] ?? ''};`,
        `ADR:${payload.values['address'] ?? ''};`,
        ';',
      ].join('');
    case 'wifi':
      return `WIFI:T:${payload.values['security'] ?? ''};S:${payload.values['ssid'] ?? ''};P:${payload.values['password'] ?? ''};H:${payload.values['hidden'] ?? 'false'};;`;
    case 'app_link':
      return `${payload.values['platform'] ?? ''}:${payload.values['url'] ?? ''}`;
    case 'event':
      return [
        'BEGIN:VEVENT',
        `SUMMARY:${payload.values['title'] ?? ''}`,
        `DTSTART:${payload.values['start'] ?? ''}`,
        `DTEND:${payload.values['end'] ?? ''}`,
        `LOCATION:${payload.values['location'] ?? ''}`,
        `DESCRIPTION:${payload.values['description'] ?? ''}`,
        'END:VEVENT',
      ].join('\n');
    case 'event_rsvp':
      return `${payload.values['event_id'] ?? ''}#${payload.values['response'] ?? ''}`;
    case 'calendar_subscription':
      return payload.values['url'] ?? '';
    case 'social_profile':
      return `${payload.values['network'] ?? ''}:${payload.values['username'] ?? ''}`;
    case 'messaging_link':
      return `${payload.values['service'] ?? ''}:${payload.values['handle'] ?? ''}`;
    case 'short_link':
      return payload.values['url'] ?? '';
    case 'utm_link': {
      const base = payload.values['url'] ?? '';
      const params = new URLSearchParams();
      params.set('utm_source', payload.values['source'] ?? '');
      params.set('utm_medium', payload.values['medium'] ?? '');
      params.set('utm_campaign', payload.values['campaign'] ?? '');
      return `${base}?${params.toString()}`;
    }
    case 'custom':
      return `CUSTOM:${payload.values['content'] ?? ''}`;
    case 'payment':
      return `${payload.values['scheme'] ?? ''}:${payload.values['address'] ?? ''}?amount=${payload.values['amount'] ?? ''}&currency=${payload.values['currency'] ?? ''}`;
    case 'product_identity':
      return `${payload.values['format'] ?? ''}:${payload.values['code'] ?? ''}`;
    default:
      return '';
  }
}

// --- Classification helpers ---

const KNOWN_SHORT_LINK_HOSTS = ['bit.ly', 't.co', 'tinyurl.com', 'buff.ly', 'goo.gl', 'ow.ly', 'is.gd', 'soo.gd', 'rebrand.ly'] as const;
const SHORT_LINK_HOSTS: ReadonlySet<string> = new Set(KNOWN_SHORT_LINK_HOSTS);

function normalizeHost(host: string): string {
  const lower = host.toLowerCase();
  return lower.startsWith('www.') ? lower.slice(4) : lower;
}

function parseHttpUrl(encoded: string): URL | null {
  if (!URL_PATTERN.test(encoded)) {
    return null;
  }

  try {
    const parsed = new URL(encoded);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function extractFieldValue(lines: readonly string[], field: string): string {
  const prefix = `${field}:`;
  for (const line of lines) {
    if (line.startsWith(prefix)) {
      return line.slice(prefix.length).trim();
    }
  }
  return '';
}

function extractSemicolonField(parts: readonly string[], field: string): string {
  const prefix = `${field}:`;
  for (const part of parts) {
    if (part.startsWith(prefix)) {
      return part.slice(prefix.length).trim();
    }
  }
  return '';
}

// --- Classification ---

function detectKind(encoded: string): readonly PayloadKind[] {
  const trimmed = encoded.trim();
  const matches: PayloadKind[] = [];
  const url = parseHttpUrl(trimmed);

  if (trimmed.startsWith('tel:')) {
    const number = trimmed.slice(4).trim();
    if (number !== '' && TEL_PATTERN.test(number)) {
      matches.push('tel');
    }
  }

  if (trimmed.startsWith('smsto:')) {
    const smsMatch = /^smsto:([+0-9\s\-()]{3,20}):(.*)?$/.exec(trimmed);
    if (smsMatch !== null && smsMatch[1].trim() !== '') {
      matches.push('sms');
    }
  }

  if (trimmed.startsWith('mailto:')) {
    const address = trimmed.slice(7).trim();
    if (address !== '' && EMAIL_PATTERN.test(address)) {
      matches.push('email');
    }
  }

  if (trimmed.startsWith('geo:')) {
    const geoMatch = /^geo:([+-]?\d+(?:\.\d+)?),([+-]?\d+(?:\.\d+)?)$/i.exec(trimmed);
    if (geoMatch !== null) {
      const latitude = Number(geoMatch[1]);
      const longitude = Number(geoMatch[2]);
      if (
        Number.isFinite(latitude) &&
        Number.isFinite(longitude) &&
        GEO_LAT_RANGE(latitude) &&
        GEO_LON_RANGE(longitude)
      ) {
        matches.push('geo');
      }
    }
  }

  if (trimmed.startsWith('BEGIN:VCARD')) {
    const lines = trimmed.split('\n');
    const fullName = extractFieldValue(lines, 'FN');
    const hasAdditional =
      ['ORG', 'TITLE', 'TEL', 'EMAIL', 'URL', 'ADR']
        .some((field) => extractFieldValue(lines, field) !== '');
    if (fullName !== '' && hasAdditional) {
      matches.push('vcard');
    }
  }

  if (trimmed.startsWith('MECARD:')) {
    const fields = trimmed.slice('MECARD:'.length).split(';');
    const name = extractSemicolonField(fields, 'N');
    const hasAdditional =
      ['TEL', 'EMAIL', 'URL', 'ADR']
        .some((field) => extractSemicolonField(fields, field) !== '');
    if (name !== '' && hasAdditional) {
      matches.push('mecard');
    }
  }

  if (trimmed.startsWith('BIZCARD:')) {
    const fields = trimmed.slice('BIZCARD:'.length).split(';');
    const name = extractSemicolonField(fields, 'N');
    const company = extractSemicolonField(fields, 'CO');
    if (name !== '' && company !== '') {
      matches.push('bizcard');
    }
  }

  if (trimmed.startsWith('WIFI:T:')) {
    const wifiMatch = /^WIFI:T:([^;]*);S:([^;]*);P:([^;]*);H:(true|false);;?$/.exec(trimmed);
    if (wifiMatch !== null) {
      const security = wifiMatch[1];
      const ssid = wifiMatch[2].trim();
      if ((security === 'WPA' || security === 'WEP' || security === 'nopass') && ssid !== '') {
        matches.push('wifi');
      }
    }
  }

  if (/^(ios|android|web):/.test(trimmed)) {
    const separator = trimmed.indexOf(':');
    if (separator >= 0 && trimmed.length > separator + 1) {
      matches.push('app_link');
    }
  }

  if (trimmed.startsWith('BEGIN:VEVENT')) {
    const lines = trimmed.split('\n');
    const start = extractFieldValue(lines, 'DTSTART');
    if (start !== '' && DATETIME_PATTERN.test(start)) {
      matches.push('event');
    }
  }

  if (/^[^#\s]+#(yes|no|maybe)\s*$/i.test(trimmed)) {
    matches.push('event_rsvp');
  }

  if (url !== null) {
    if (/[?&]utm_(source|medium|campaign)=/i.test(trimmed)) {
      matches.push('utm_link');
    }
    if (normalizeHost(url.hostname).length > 0 && SHORT_LINK_HOSTS.has(normalizeHost(url.hostname))) {
      matches.push('short_link');
    }
    if (url.pathname.toLowerCase().endsWith('.ics')) {
      matches.push('calendar_subscription');
    }
    matches.push('url');
  }

  const paymentMatch = /^(BITCOIN|ETH|PAY):(.+)$/.exec(trimmed);
  if (paymentMatch !== null && paymentMatch[2].trim() !== '') {
    matches.push('payment');
  }

  const productMatch = /^(EAN13|EAN8|UPCA|UPCE|CODE128|CODE39):(.+)$/.exec(trimmed);
  if (productMatch !== null && productMatch[2].trim() !== '') {
    matches.push('product_identity');
  }

  if (trimmed.startsWith('CUSTOM:')) {
    const customValue = trimmed.slice('CUSTOM:'.length);
    if (customValue !== '') {
      matches.push('custom');
    }
  }

  if (!trimmed.startsWith('CUSTOM:')) {
    const socialMatch = /^([A-Za-z][A-Za-z0-9._-]{0,31}):([A-Za-z0-9._+\-@]+)$/.exec(trimmed);
    if (socialMatch !== null) {
      matches.push('social_profile');
      matches.push('messaging_link');
    }
  }

  if (trimmed.length > 0 && matches.length === 0) {
    matches.push('plain_text');
  }

  return matches;
}

export function classifyEncoded(encoded: string): ClassificationResult {
  const matches = detectKind(encoded);
  const kind = matches[0] ?? 'plain_text';
  return { success: true, kind, matches };
}

// --- Test vectors ---

export interface PayloadTestVector {
  readonly valid: Payload;
  readonly invalid: Payload;
}

export const PAYLOAD_TEST_VECTORS: Readonly<Record<PayloadKind, PayloadTestVector>> = {
  plain_text: {
    valid: { kind: 'plain_text', values: { text: 'Hello world' } },
    invalid: { kind: 'plain_text', values: {} },
  },
  url: {
    valid: { kind: 'url', values: { url: 'https://example.com' } },
    invalid: { kind: 'url', values: { url: 'not-a-url' } },
  },
  tel: {
    valid: { kind: 'tel', values: { number: '+1-202-555-0100' } },
    invalid: { kind: 'tel', values: { number: 'abc' } },
  },
  email: {
    valid: { kind: 'email', values: { address: 'user@example.com', subject: 'Hi', body: 'Body' } },
    invalid: { kind: 'email', values: { address: 'no-at-sign' } },
  },
  sms: {
    valid: { kind: 'sms', values: { number: '+15551234567', message: 'Hi there' } },
    invalid: { kind: 'sms', values: { number: 'not-a-number' } },
  },
  geo: {
    valid: { kind: 'geo', values: { latitude: '37.7749', longitude: '-122.4194' } },
    invalid: { kind: 'geo', values: { latitude: '200', longitude: '0' } },
  },
  vcard: {
    valid: {
      kind: 'vcard',
      values: {
        name: 'Jane Doe',
        organization: 'Acme',
        title: 'CTO',
        phone: '+15551234567',
        email: 'jane@example.com',
        url: 'https://example.com',
        address: '1 Main St',
      },
    },
    invalid: { kind: 'vcard', values: {} },
  },
  mecard: {
    valid: { kind: 'mecard', values: { name: 'Jane', phone: '+15551234567' } },
    invalid: { kind: 'mecard', values: {} },
  },
  bizcard: {
    valid: { kind: 'bizcard', values: { name: 'Jane', company: 'Acme' } },
    invalid: { kind: 'bizcard', values: { name: 'Jane' } },
  },
  wifi: {
    valid: { kind: 'wifi', values: { ssid: 'MyNet', password: 'secret', security: 'WPA', hidden: 'false' } },
    invalid: { kind: 'wifi', values: { ssid: 'MyNet', security: 'WEP2' } },
  },
  app_link: {
    valid: { kind: 'app_link', values: { platform: 'ios', url: 'myapp://x', fallback: 'https://example.com' } },
    invalid: { kind: 'app_link', values: { platform: 'blackberry', url: 'x' } },
  },
  event: {
    valid: { kind: 'event', values: { title: 'Launch', start: '2025-01-01T10:00:00', end: '2025-01-01T11:00:00' } },
    invalid: { kind: 'event', values: { title: 'Launch', start: 'tomorrow' } },
  },
  event_rsvp: {
    valid: { kind: 'event_rsvp', values: { event_id: 'evt_123', response: 'yes' } },
    invalid: { kind: 'event_rsvp', values: { event_id: 'evt_123', response: 'perhaps' } },
  },
  calendar_subscription: {
    valid: { kind: 'calendar_subscription', values: { url: 'https://example.com/cal.ics' } },
    invalid: { kind: 'calendar_subscription', values: { url: 'not a url' } },
  },
  social_profile: {
    valid: { kind: 'social_profile', values: { network: 'twitter', username: 'jane' } },
    invalid: { kind: 'social_profile', values: { network: 'twitter' } },
  },
  messaging_link: {
    valid: { kind: 'messaging_link', values: { service: 'whatsapp', handle: '+15551234567' } },
    invalid: { kind: 'messaging_link', values: { service: 'whatsapp' } },
  },
  short_link: {
    valid: { kind: 'short_link', values: { url: 'https://bit.ly/abc' } },
    invalid: { kind: 'short_link', values: { url: 'nope' } },
  },
  utm_link: {
    valid: {
      kind: 'utm_link',
      values: {
        url: 'https://example.com/page',
        source: 'newsletter',
        medium: 'email',
        campaign: 'spring',
      },
    },
    invalid: {
      kind: 'utm_link',
      values: { url: 'nope', source: 'a', medium: 'b', campaign: 'c' },
    },
  },
  custom: {
    valid: { kind: 'custom', values: { content: 'arbitrary-bytes' } },
    invalid: { kind: 'custom', values: {} },
  },
  payment: {
    valid: {
      kind: 'payment',
      values: { scheme: 'BITCOIN', address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', amount: '0.01', currency: 'BTC' },
    },
    invalid: { kind: 'payment', values: { scheme: 'BITCOIN' } },
  },
  product_identity: {
    valid: { kind: 'product_identity', values: { code: '012345678905', format: 'EAN13' } },
    invalid: { kind: 'product_identity', values: { code: '012345678905', format: 'UNKNOWN' } },
  },
};

// --- Validation requirement: per-kind representative + near-miss vectors ---

export interface PayloadValidationVector {
  readonly kind: PayloadKind;
  readonly representative: Payload;
  readonly nearMiss: Payload;
}

export const PAYLOAD_VALIDATION_VECTORS: Readonly<
  Record<PayloadKind, PayloadValidationVector>
> = {
  plain_text: {
    kind: 'plain_text',
    representative: { kind: 'plain_text', values: { text: 'Hello world' } },
    nearMiss: { kind: 'plain_text', values: {} },
  },
  url: {
    kind: 'url',
    representative: { kind: 'url', values: { url: 'https://example.com' } },
    nearMiss: { kind: 'url', values: { url: 'not-a-url' } },
  },
  tel: {
    kind: 'tel',
    representative: { kind: 'tel', values: { number: '+1-202-555-0100' } },
    nearMiss: { kind: 'tel', values: { number: 'abc' } },
  },
  email: {
    kind: 'email',
    representative: { kind: 'email', values: { address: 'user@example.com', subject: 'Hi', body: 'Body' } },
    nearMiss: { kind: 'email', values: { address: 'no-at-sign' } },
  },
  sms: {
    kind: 'sms',
    representative: { kind: 'sms', values: { number: '+15551234567', message: 'Hi there' } },
    nearMiss: { kind: 'sms', values: { number: 'not-a-number' } },
  },
  geo: {
    kind: 'geo',
    representative: { kind: 'geo', values: { latitude: '37.7749', longitude: '-122.4194' } },
    nearMiss: { kind: 'geo', values: { latitude: '200', longitude: '0' } },
  },
  vcard: {
    kind: 'vcard',
    representative: {
      kind: 'vcard',
      values: {
        name: 'Jane Doe',
        organization: 'Acme',
        title: 'CTO',
        phone: '+15551234567',
        email: 'jane@example.com',
        url: 'https://example.com',
        address: '1 Main St',
      },
    },
    nearMiss: { kind: 'vcard', values: { name: 'Jane Doe' } },
  },
  mecard: {
    kind: 'mecard',
    representative: { kind: 'mecard', values: { name: 'Jane', phone: '+15551234567' } },
    nearMiss: { kind: 'mecard', values: { name: 'Jane', phone: 'not-a-number' } },
  },
  bizcard: {
    kind: 'bizcard',
    representative: { kind: 'bizcard', values: { name: 'Jane', company: 'Acme' } },
    nearMiss: { kind: 'bizcard', values: { name: 'Jane', company: '' } },
  },
  wifi: {
    kind: 'wifi',
    representative: { kind: 'wifi', values: { ssid: 'MyNet', password: 'secret', security: 'WPA', hidden: 'false' } },
    nearMiss: { kind: 'wifi', values: { ssid: 'MyNet', security: 'WEP2' } },
  },
  app_link: {
    kind: 'app_link',
    representative: { kind: 'app_link', values: { platform: 'ios', url: 'myapp://x', fallback: 'https://example.com' } },
    nearMiss: { kind: 'app_link', values: { platform: 'blackberry', url: 'x' } },
  },
  event: {
    kind: 'event',
    representative: { kind: 'event', values: { title: 'Launch', start: '2025-01-01T10:00:00', end: '2025-01-01T11:00:00' } },
    nearMiss: { kind: 'event', values: { title: 'Launch', start: 'tomorrow' } },
  },
  event_rsvp: {
    kind: 'event_rsvp',
    representative: { kind: 'event_rsvp', values: { event_id: 'evt_123', response: 'yes' } },
    nearMiss: { kind: 'event_rsvp', values: { event_id: 'evt_123', response: 'perhaps' } },
  },
  calendar_subscription: {
    kind: 'calendar_subscription',
    representative: { kind: 'calendar_subscription', values: { url: 'https://example.com/cal.ics' } },
    nearMiss: { kind: 'calendar_subscription', values: { url: 'not a url' } },
  },
  social_profile: {
    kind: 'social_profile',
    representative: { kind: 'social_profile', values: { network: 'twitter', username: 'jane' } },
    nearMiss: { kind: 'social_profile', values: { network: 'twitter', username: '' } },
  },
  messaging_link: {
    kind: 'messaging_link',
    representative: { kind: 'messaging_link', values: { service: 'whatsapp', handle: '+15551234567' } },
    nearMiss: { kind: 'messaging_link', values: { service: 'whatsapp', handle: '' } },
  },
  short_link: {
    kind: 'short_link',
    representative: { kind: 'short_link', values: { url: 'https://bit.ly/abc' } },
    nearMiss: { kind: 'short_link', values: { url: 'nope' } },
  },
  utm_link: {
    kind: 'utm_link',
    representative: {
      kind: 'utm_link',
      values: {
        url: 'https://example.com/page',
        source: 'newsletter',
        medium: 'email',
        campaign: 'spring',
      },
    },
    nearMiss: {
      kind: 'utm_link',
      values: { url: 'nope', source: 'a', medium: 'b', campaign: 'c' },
    },
  },
  custom: {
    kind: 'custom',
    representative: { kind: 'custom', values: { content: 'arbitrary-bytes' } },
    nearMiss: { kind: 'custom', values: {} },
  },
  payment: {
    kind: 'payment',
    representative: {
      kind: 'payment',
      values: { scheme: 'BITCOIN', address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', amount: '0.01', currency: 'BTC' },
    },
    nearMiss: { kind: 'payment', values: { scheme: 'BITCOIN', address: '' } },
  },
  product_identity: {
    kind: 'product_identity',
    representative: { kind: 'product_identity', values: { code: '012345678905', format: 'EAN13' } },
    nearMiss: { kind: 'product_identity', values: { code: '012345678905', format: 'UNKNOWN' } },
  },
};

export interface PayloadVerification {
  readonly kind: PayloadKind;
  readonly roundTrip: boolean;
  readonly nearMissRejected: boolean;
}

// --- Helper: build a near-miss that, even if accepted by field validation, will
// not classify back to the original kind under the detectKind() rules. The
// requirement is that the near-miss does NOT round-trip; we use encode-then-
// classify and compare against the original kind.

function nearMissClassifiesToKind(nearMiss: Payload, kind: PayloadKind): boolean {
  const nearMissEncoded = encodePayload(nearMiss);
  const nearMissClassified = classifyEncoded(nearMissEncoded);
  return nearMissClassified.matches.includes(kind);
}

export function verifyValidationVectors(): readonly PayloadVerification[] {
  const results: PayloadVerification[] = [];
  for (const kind of PAYLOAD_KINDS) {
    const vec = PAYLOAD_VALIDATION_VECTORS[kind];

    const representativeValidation = validatePayload(vec.representative);
    let roundTrip = false;
    if (representativeValidation.success) {
      const encoded = encodePayload(vec.representative);
      const classified = classifyEncoded(encoded);
      roundTrip = classified.matches.includes(kind);
    }

    const nearMissValidation = validatePayload(vec.nearMiss);
    let nearMissRejected = !nearMissValidation.success;
    if (!nearMissRejected) {
      nearMissRejected = !nearMissClassifiesToKind(vec.nearMiss, kind);
    }

    results.push({
      kind,
      roundTrip,
      nearMissRejected,
    });
  }
  return results;
}

export function verifyPayloadVectors(): readonly PayloadVerification[] {
  const results: PayloadVerification[] = [];
  for (const kind of PAYLOAD_KINDS) {
    const vector = PAYLOAD_TEST_VECTORS[kind];
    const encoded = encodePayload(vector.valid);
    const classified = classifyEncoded(encoded);
    const roundTrip = classified.matches.includes(kind);
    const invalidValidation = validatePayload(vector.invalid);
    let nearMissRejected = !invalidValidation.success;
    if (!nearMissRejected) {
      nearMissRejected = !nearMissClassifiesToKind(vector.invalid, kind);
    }
    results.push({ kind, roundTrip, nearMissRejected });
  }
  return results;
}

// --- UI semantics: present exactly the fields the kind declares ---

export interface PayloadFieldPresentation {
  readonly field: PayloadField;
  readonly value: string;
  readonly visible: boolean;
}

export function presentFields(payload: Payload): readonly PayloadFieldPresentation[] {
  const fields = SCHEMAS[payload.kind];
  const presented: PayloadFieldPresentation[] = [];
  for (const field of fields) {
    const raw = payload.values[field.name];
    const value = raw ?? '';
    presented.push({ field, value, visible: true });
  }
  return presented;
}

// --- State model: presentation is independent of payload kind ---

export function changePresentation(
  state: PayloadState,
  update: (p: PresentationOptions) => PresentationOptions,
  audit?: (before: Payload, after: Payload) => void
): PayloadState {
  if (audit !== undefined) {
    audit(state.payload, state.payload);
  }
  const nextPresentation = update(state.presentation);
  return {
    identifier: 'structuredpayloadrepresentation:state',
    presentation: nextPresentation,
    payload: state.payload,
  };
}

// --- Hashing helper for stable test identifiers ---

export function fingerprintPayload(payload: Payload): string {
  const encoded = encodePayload(payload);
  const hash = crypto.createHash('sha256');
  hash.update(encoded);
  return hash.digest('hex');
}

// --- Composite demonstration ---

export function demo(): readonly PayloadVerification[] {
  return verifyValidationVectors();
}