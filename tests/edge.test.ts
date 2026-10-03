import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  backoffSeconds,
  classifyExpoResult,
  extractRevenueCatUsers,
  HttpError,
  parseRevenueCatEntitlement,
  parseRevenueCatEvent,
  readLimitedJson,
  secretMatches,
} from '../supabase/functions/_shared/core.ts';
import { queryRevenueCat } from '../supabase/functions/_shared/revenuecat.ts';
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

function customer(expiresDate: unknown, graceDate: unknown = null) {
  return {
    subscriber: {
      original_purchase_date: '2026-09-01T12:00:00Z',
      entitlements: {
        deriva_premium: {
          expires_date: expiresDate,
          grace_period_expires_date: graceDate,
          purchase_date: '2026-10-01T12:00:00Z',
          product_identifier: 'deriva_monthly',
        },
      },
    },
  };
}

test('una compra vitalicia explícita permanece activa sin fecha de caducidad', () => {
  const result = parseRevenueCatEntitlement(customer(null), now);
  assert.equal(result.active, true);
  assert.equal(result.expiresAt, null);
  assert.equal(result.originalPurchaseDate, '2026-09-01T12:00:00.000Z');
});

test('el derecho exige que su fecha de caducidad sea posterior al momento actual', () => {
  assert.equal(
    parseRevenueCatEntitlement(customer('2026-10-03T04:00:01Z'), now).active,
    true,
  );
  assert.equal(
    parseRevenueCatEntitlement(customer('2026-10-03T04:00:00Z'), now).active,
    false,
  );
});

test('un periodo de gracia válido prolonga un derecho cuya fecha principal es válida', () => {
  const result = parseRevenueCatEntitlement(
    customer('2026-10-02T04:00:00Z', '2026-10-04T04:00:00Z'),
    now,
  );
  assert.equal(result.active, true);
  assert.equal(result.expiresAt, '2026-10-04T04:00:00.000Z');
});

test('una fecha inválida o ausente nunca se interpreta como una compra vitalicia', () => {
  for (const expiry of ['invalid', undefined, 123]) {
    assert.throws(
      () =>
        parseRevenueCatEntitlement(
          customer(expiry, '2026-10-04T04:00:00Z'),
          now,
        ),
      HttpError,
    );
  }
});

test('sin deriva_premium no se concede premium aunque existan otros productos', () => {
  const result = parseRevenueCatEntitlement({
    subscriber: {
      entitlements: { another_product: { expires_date: null } },
      subscriptions: {
        deriva_monthly: { expires_date: '2027-10-03T04:00:00Z' },
      },
    },
  }, now);
  assert.equal(result.active, false);
  assert.equal(result.expiresAt, null);
});

test('una respuesta incompleta del proveedor se rechaza sin inventar un estado', () => {
  assert.throws(
    () => parseRevenueCatEntitlement({ subscriber: {} }, now),
    HttpError,
  );
  assert.throws(() => parseRevenueCatEntitlement({}, now), HttpError);
});

test('el webhook valida sus campos mínimos antes de procesarlo', () => {
  assert.throws(
    () => parseRevenueCatEvent({ event: { type: 'INITIAL_PURCHASE' } }),
    HttpError,
  );
  assert.throws(
    () => parseRevenueCatEvent({ event: { id: 'evt', type: [] } }),
    HttpError,
  );
  assert.equal(
    parseRevenueCatEvent({ event: { id: 'evt', type: 'FUTURE_NEW_EVENT' } })
      .type,
    'FUTURE_NEW_EVENT',
  );
});

test('los usuarios del webhook son UUID reales y se deduplican', () => {
  const users = extractRevenueCatUsers({
    id: 'evt',
    type: 'INITIAL_PURCHASE',
    app_user_id: userA,
    original_app_user_id: '$RCAnonymousID:example',
    aliases: [
      userA.toUpperCase(),
      userB,
      'arbitrary',
      '00000000-0000-0000-0000-000000000000',
    ],
  });
  assert.deepEqual(users, [userA, userB]);
});

test('una transferencia vuelve a verificar tanto origen como destino', () => {
  assert.deepEqual(
    extractRevenueCatUsers({
      id: 'transfer',
      type: 'TRANSFER',
      transferred_from: [userA, '$RCAnonymousID:example'],
      transferred_to: [userB, userA],
    }),
    [userA, userB],
  );
});

test('el evento TEST no puede conceder derechos a un usuario', () => {
  assert.deepEqual(
    extractRevenueCatUsers({ id: 'test', type: 'TEST', app_user_id: userA }),
    [],
  );
});

test('la comparación del secreto exige coincidencia exacta y falla si falta', async () => {
  assert.equal(await secretMatches('token-private', 'token-private'), true);
  assert.equal(await secretMatches('token-privatE', 'token-private'), false);
  assert.equal(await secretMatches('token-private ', 'token-private'), false);
  assert.equal(await secretMatches('', ''), false);
  assert.equal(await secretMatches(undefined, 'token-private'), false);
});

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

test('RevenueCat 404 representa un usuario sin derechos y no concede premium', async () => {
  const result = await queryRevenueCat(
    userA,
    'secret',
    async () => new Response('', { status: 404 }),
  );
  assert.equal(result.snapshot.active, false);
});

test('un fallo del proveedor produce 503 en vez de revocar una compra existente', async () => {
  await assert.rejects(
    queryRevenueCat(
      userA,
      'secret',
      async () => new Response('untrusted details', { status: 502 }),
    ),
    (error: unknown) => error instanceof HttpError && error.status === 503,
  );
});

test('la marca de verificación se registra antes de esperar al proveedor', async () => {
  let clock = now;
  const result = await queryRevenueCat(userA, 'secret', async () => {
    clock += 5000;
    return Response.json(customer(null));
  }, () => clock);
  assert.equal(result.observedAt, '2026-10-03T04:00:00.000Z');
  assert.equal(result.snapshot.active, true);
});

test('una respuesta JSON dañada del proveedor también solicita reintento', async () => {
  await assert.rejects(
    queryRevenueCat(
      userA,
      'secret',
      async () => new Response('invalid-json', { status: 200 }),
    ),
    (error: unknown) => error instanceof HttpError && error.status === 503,
  );
});

test('el proveedor de pagos exige una clave de servidor y un UUID de cuenta', async () => {
  await assert.rejects(
    queryRevenueCat(userA, ''),
    (error: unknown) => error instanceof HttpError && error.status === 503,
  );
  await assert.rejects(
    queryRevenueCat('$RCAnonymousID:test', 'secret'),
    (error: unknown) => error instanceof HttpError && error.status === 400,
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
