export const PREMIUM_ENTITLEMENT = 'deriva_premium';
export const MAX_PUSH_ATTEMPTS = 5;

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(value);
}

export function bearerToken(header: string | null): string | undefined {
  if (!header || header.length > 8192) return undefined;
  return /^Bearer[ \t]+([^\s]+)$/i.exec(header)?.[1];
}

// Hashing first keeps the comparison loop at a fixed length, including unequal inputs.
export async function secretMatches(
  provided: string | undefined,
  expected: string | undefined,
): Promise<boolean> {
  if (
    !provided || !expected || provided.length > 8192 || expected.length > 8192
  ) return false;
  const encoder = new TextEncoder();
  const [actual, target] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(provided)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  const left = new Uint8Array(actual);
  const right = new Uint8Array(target);
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

function providerInvalid(): never {
  throw new HttpError(
    503,
    'billing_provider_invalid',
    'El proveedor de pagos devolvió un estado incompleto. Intenta de nuevo.',
  );
}

function timestamp(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/
      .test(value)
  ) providerInvalid();
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) providerInvalid();
  return new Date(parsed).toISOString();
}

export interface EntitlementSnapshot {
  active: boolean;
  expiresAt: string | null;
  productIdentifier: string | null;
  purchaseDate: string | null;
  originalPurchaseDate: string | null;
}

export function inactiveEntitlement(): EntitlementSnapshot {
  return {
    active: false,
    expiresAt: null,
    productIdentifier: null,
    purchaseDate: null,
    originalPurchaseDate: null,
  };
}

export function parseRevenueCatEntitlement(
  payload: unknown,
  now = Date.now(),
): EntitlementSnapshot {
  if (
    !Number.isFinite(now) || !isRecord(payload) ||
    !isRecord(payload.subscriber) ||
    !isRecord(payload.subscriber.entitlements)
  ) providerInvalid();
  const subscriber = payload.subscriber;
  const entitlements = subscriber.entitlements as Record<string, unknown>;
  if (!Object.hasOwn(entitlements, PREMIUM_ENTITLEMENT)) {
    return inactiveEntitlement();
  }
  const entitlement = entitlements[PREMIUM_ENTITLEMENT];
  if (
    !isRecord(entitlement) ||
    typeof entitlement.product_identifier !== 'string' ||
    entitlement.product_identifier.length === 0 ||
    entitlement.product_identifier.length > 256
  ) providerInvalid();
  // Only an explicit null means lifetime. Missing or malformed dates must never grant it.
  const expiration = entitlement.expires_date === null
    ? null
    : timestamp(entitlement.expires_date);
  const grace = entitlement.grace_period_expires_date == null
    ? null
    : timestamp(entitlement.grace_period_expires_date);
  const expiresAt =
    expiration && grace && Date.parse(grace) > Date.parse(expiration)
      ? grace
      : expiration;
  return {
    active: expiresAt === null || Date.parse(expiresAt) > now,
    expiresAt,
    productIdentifier: entitlement.product_identifier,
    purchaseDate: timestamp(entitlement.purchase_date),
    originalPurchaseDate: subscriber.original_purchase_date == null
      ? null
      : timestamp(subscriber.original_purchase_date),
  };
}

export interface RevenueCatEvent extends Record<string, unknown> {
  id: string;
  type: string;
}

export function parseRevenueCatEvent(payload: unknown): RevenueCatEvent {
  if (
    !isRecord(payload) || !isRecord(payload.event) ||
    typeof payload.event.id !== 'string' ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(payload.event.id) ||
    typeof payload.event.type !== 'string' ||
    !/^[A-Z][A-Z0-9_]{0,63}$/.test(payload.event.type)
  ) {
    throw new HttpError(
      400,
      'invalid_webhook',
      'El evento de pagos no tiene un formato válido.',
    );
  }
  return payload.event as RevenueCatEvent;
}

export function extractRevenueCatUsers(event: RevenueCatEvent): string[] {
  if (event.type === 'TEST') return [];
  const candidates: unknown[] = event.type === 'TRANSFER'
    ? []
    : [event.app_user_id, event.original_app_user_id];
  const arrays = event.type === 'TRANSFER'
    ? [event.transferred_from, event.transferred_to]
    : [event.aliases];
  for (const array of arrays) {
    if (Array.isArray(array)) candidates.push(...array);
  }
  const users = [
    ...new Set(candidates.filter(isUuid).map((value) => value.toLowerCase())),
  ];
  if (users.length > 50) {
    throw new HttpError(
      413,
      'webhook_too_many_users',
      'El evento contiene demasiadas cuentas.',
    );
  }
  return users;
}

export async function readLimitedJson(
  message: Request | Response,
  maximumBytes = 65536,
): Promise<unknown> {
  const contentLength = message.headers.get('content-length');
  if (
    contentLength && /^\d+$/.test(contentLength) &&
    Number(contentLength) > maximumBytes
  ) {
    throw new HttpError(
      413,
      'body_too_large',
      'El contenido excede el tamaño permitido.',
    );
  }
  if (!message.body) {
    throw new HttpError(400, 'invalid_json', 'Se requiere contenido JSON.');
  }
  const reader = message.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > maximumBytes) {
        await reader.cancel();
        throw new HttpError(
          413,
          'body_too_large',
          'El contenido excede el tamaño permitido.',
        );
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new HttpError(400, 'invalid_json', 'El contenido JSON no es válido.');
  }
}

export function backoffSeconds(attempt: number): number {
  const safeAttempt = Number.isFinite(attempt)
    ? Math.max(1, Math.min(16, Math.floor(attempt)))
    : 1;
  return Math.min(3600, 30 * 2 ** (safeAttempt - 1));
}

export type ExpoDisposition =
  | { action: 'ticketed'; ticketId: string }
  | { action: 'delivered' }
  | { action: 'removeToken'; error: string }
  | { action: 'retry' | 'failed'; error: string };

const knownExpoErrors = new Set([
  'DeviceNotRegistered',
  'MessageTooBig',
  'MessageRateExceeded',
  'MismatchSenderId',
  'InvalidCredentials',
  'InvalidPushToken',
]);
const permanentExpoErrors = new Set([
  'MessageTooBig',
  'MismatchSenderId',
  'InvalidCredentials',
  'InvalidPushToken',
]);

export function retryDisposition(
  attempts: number,
  error: string,
): ExpoDisposition {
  return { action: attempts >= MAX_PUSH_ATTEMPTS ? 'failed' : 'retry', error };
}

export function classifyExpoResult(
  value: unknown,
  attempts: number,
  receipt = false,
): ExpoDisposition {
  if (!isRecord(value)) {
    return retryDisposition(attempts, 'InvalidExpoResponse');
  }
  if (value.status === 'ok') {
    if (receipt) return { action: 'delivered' };
    if (
      typeof value.id === 'string' && value.id.length > 0 &&
      value.id.length <= 200
    ) {
      return { action: 'ticketed', ticketId: value.id };
    }
    return retryDisposition(attempts, 'InvalidExpoResponse');
  }
  if (value.status !== 'error') {
    return retryDisposition(attempts, 'InvalidExpoResponse');
  }
  const rawCode = isRecord(value.details) ? value.details.error : undefined;
  const code = typeof rawCode === 'string' && knownExpoErrors.has(rawCode)
    ? rawCode
    : 'UnknownExpoError';
  if (code === 'DeviceNotRegistered') {
    return { action: 'removeToken', error: code };
  }
  if (permanentExpoErrors.has(code)) return { action: 'failed', error: code };
  // Never persist Expo's message: it may contain the private device token.
  return retryDisposition(attempts, code);
}

export async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  operation: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await operation(items[index]);
      }
    }),
  );
  return results;
}
