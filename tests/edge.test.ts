import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  backoffSeconds,
  classifyExpoResult,
  HttpError,
  readLimitedJson,
} from '../supabase/functions/_shared/core.ts';
import {
  expoMessage,
  isExpoPushToken,
  receiptExpired,
  requestFailure,
  retryAvailableAt,
} from '../supabase/functions/_shared/push.ts';

const now = Date.parse('2026-10-03T04:00:00Z');
const userA = '76a814f7-3ebd-43fa-9baa-1ca759ae76dc';
const userB = '725d9620-812b-4517-9fe1-2ab7d0b3b129';

test('los reintentos usan espera exponencial con un límite', () => {
  assert.equal(backoffSeconds(1), 30);
  assert.equal(backoffSeconds(2), 60);
  assert.equal(backoffSeconds(5), 480);
  assert.equal(backoffSeconds(100), 3600);
});

test('Expo elimina tokens revocados y falla definitivamente si el mensaje es demasiado grande', () => {
  assert.deepEqual(
    classifyExpoResult({
      status: 'error',
      details: { error: 'DeviceNotRegistered' },
    }, 1),
    {
      action: 'removeToken',
      error: 'DeviceNotRegistered',
    },
  );
  assert.deepEqual(
    classifyExpoResult(
      { status: 'error', details: { error: 'MessageTooBig' } },
      1,
    ),
    {
      action: 'failed',
      error: 'MessageTooBig',
    },
  );
});

test('los fallos transitorios de Expo se reintentan como máximo cinco veces', () => {
  const error = { status: 'error', details: { error: 'MessageRateExceeded' } };
  assert.equal(classifyExpoResult(error, 4).action, 'retry');
  assert.equal(classifyExpoResult(error, 5).action, 'failed');
  assert.equal(
    classifyExpoResult({ message: 'untrusted token or secret' }, 1).error,
    'InvalidExpoResponse',
  );
});

test('un ticket exige su identificador y un recibo exitoso indica aceptación del proveedor', () => {
  assert.deepEqual(
    classifyExpoResult({ status: 'ok', id: 'receipt-uuid' }, 1),
    {
      action: 'ticketed',
      ticketId: 'receipt-uuid',
    },
  );
  assert.equal(classifyExpoResult({ status: 'ok' }, 1).action, 'retry');
  assert.deepEqual(classifyExpoResult({ status: 'ok' }, 1, true), {
    action: 'delivered',
  });
});

test('el tamaño máximo del webhook cuenta bytes UTF-8', async () => {
  await assert.rejects(
    readLimitedJson(
      new Request('https://local.test', {
        method: 'POST',
        body: JSON.stringify({ text: 'á'.repeat(20) }),
      }),
      30,
    ),
    (error: unknown) => error instanceof HttpError && error.status === 413,
  );
  assert.deepEqual(
    await readLimitedJson(
      new Request('https://local.test', {
        method: 'POST',
        body: '{"event":{}}',
      }),
      30,
    ),
    { event: {} },
  );
});

test('un fallo de red de Expo libera la notificación para reintento y 400 es definitivo', () => {
  assert.deepEqual(requestFailure(undefined, 1), {
    action: 'retry',
    error: 'ExpoNetworkUnavailable',
  });
  assert.equal(requestFailure(429, 4).action, 'retry');
  assert.equal(requestFailure(503, 5).action, 'failed');
  assert.deepEqual(requestFailure(400, 1), {
    action: 'failed',
    error: 'ExpoHttp400',
  });
  assert.equal(retryAvailableAt(2, now), '2026-10-03T04:01:00.000Z');
});

test('los recibos caducan 24 horas después del ticket original y no del último sondeo', () => {
  assert.equal(receiptExpired('2026-10-02T04:00:01Z', now), false);
  assert.equal(receiptExpired('2026-10-02T04:00:00Z', now), true);
  assert.equal(receiptExpired('invalid', now), true);
});

test('el mensaje push conserva los IDs y limita texto Unicode sin dividir caracteres', () => {
  const message = expoMessage({
    id: userA,
    token_id: userB,
    token: 'ExpoPushToken[device]',
    attempts: 1,
    notification_id: userA,
    place_id: userB,
    title: '🌵'.repeat(100),
    body: 'á'.repeat(400),
  });
  assert.equal(Array.from(message.title).length, 80);
  assert.equal(Array.from(message.body).length, 280);
  assert.deepEqual(message.data, { placeId: userB, notificationId: userA });
  assert.equal(message.channelId, 'nearby');
  assert.ok(
    new TextEncoder().encode(JSON.stringify(message)).byteLength < 4096,
  );
});

test('solo se envían tokens de Expo con formato reconocido', () => {
  assert.equal(isExpoPushToken('ExpoPushToken[abc_-]'), true);
  assert.equal(isExpoPushToken('ExponentPushToken[abc_-]'), true);
  assert.equal(isExpoPushToken('ExpoPushToken[]'), false);
  assert.equal(isExpoPushToken('unexpected-secret'), false);
});
