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
