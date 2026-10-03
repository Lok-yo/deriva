import assert from 'node:assert/strict';
import { test } from 'node:test';
import { captureExpectedSession, createOperationQueue, createSessionClient, SessionChangedError } from '../src/services/identity';
import { commitPushRegistration, createNotificationTapConsumer } from '../src/services/notificationsCore';

const accountA = '76a814f7-3ebd-43fa-9baa-1ca759ae76dc';
const accountB = '725d9620-812b-4517-9fe1-2ab7d0b3b129';
const sessionA = { user: { id: accountA }, access_token: 'jwt-account-A' };
const sessionB = { user: { id: accountB }, access_token: 'jwt-account-B' };

test('una operación pendiente rechaza una cuenta diferente después de esperar', async () => {
  let session = sessionA;
  const guard = await captureExpectedSession(accountA, async () => session);
  session = sessionB;
  await assert.rejects(guard.assertCurrent(), SessionChangedError);
});

test('la cancelación del efecto invalida la operación aunque el usuario siga siendo A', async () => {
  let current = true;
  const guard = await captureExpectedSession(accountA, async () => sessionA, () => current);
  current = false;
  await assert.rejects(guard.assertCurrent(), SessionChangedError);
});

test('un JWT renovado de la misma cuenta no cambia la identidad capturada', async () => {
  let session = sessionA;
  const guard = await captureExpectedSession(accountA, async () => session);
  session = { ...sessionA, access_token: 'jwt-account-A-refreshed' };
  await guard.assertCurrent();
  assert.equal(guard.accessToken, 'jwt-account-A');
});

test('RPC, eliminación y verificación usan el JWT capturado en vez del de una cuenta nueva', async () => {
  const authorizations: string[] = [];
  const client = createSessionClient('https://backend.test', 'sb_publishable_test_only', 'jwt-account-A', async (_input, init) => {
    authorizations.push(new Headers(init?.headers).get('authorization') ?? '');
    return Response.json([]);
  });
  await client.rpc('deriva_register_push_token', { p_token: 'ExpoPushToken[test]' });
  await client.from('deriva_push_tokens').delete().eq('user_id', accountA).eq('token', 'ExpoPushToken[test]');
  await client.functions.invoke('deriva-billing-sync', { body: {} });
  assert.deepEqual(authorizations, ['Bearer jwt-account-A', 'Bearer jwt-account-A', 'Bearer jwt-account-A']);
});

test('si cambia la sesión durante el registro se compensa bajo A y no se persiste el token', async () => {
  let session = sessionA;
  const guard = await captureExpectedSession(accountA, async () => session);
  const calls: string[] = [];
  await assert.rejects(commitPushRegistration(guard, {
    register: async () => { calls.push('register-A'); session = sessionB; },
    persist: async () => { calls.push('persist-A'); },
    rollback: async () => { calls.push('remove-A'); },
  }), SessionChangedError);
  assert.deepEqual(calls, ['register-A', 'remove-A']);
});

test('un registro cancelado después de persistir también retira el token de A', async () => {
  let current = true;
  const guard = await captureExpectedSession(accountA, async () => sessionA, () => current);
  const calls: string[] = [];
  await assert.rejects(commitPushRegistration(guard, {
    register: async () => { calls.push('register-A'); },
    persist: async () => { calls.push('persist-A'); current = false; },
    rollback: async () => { calls.push('remove-A'); },
  }), SessionChangedError);
  assert.deepEqual(calls, ['register-A', 'persist-A', 'remove-A']);
});

test('el trabajo cancelado antes del RPC no registra ni compensa nada', async () => {
  let current = true;
  const guard = await captureExpectedSession(accountA, async () => sessionA, () => current);
  current = false;
  const calls: string[] = [];
  await assert.rejects(commitPushRegistration(guard, {
    register: async () => { calls.push('register'); },
    persist: async () => { calls.push('persist'); },
    rollback: async () => { calls.push('rollback'); },
  }), SessionChangedError);
  assert.deepEqual(calls, []);
});

test('el SDK conserva su identidad hasta terminar una compra o restauración en curso', async () => {
  const serialized = createOperationQueue();
  const calls: string[] = [];
  let finish: (() => void) | undefined;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  const purchase = serialized(async () => { calls.push('purchase-A'); await pending; calls.push('purchase-A-finished'); });
  const switchIdentity = serialized(async () => { calls.push('login-B'); });
  await Promise.resolve();
  assert.deepEqual(calls, ['purchase-A']);
  finish!();
  await Promise.all([purchase, switchIdentity]);
  assert.deepEqual(calls, ['purchase-A', 'purchase-A-finished', 'login-B']);
});

test('una operación fallida no bloquea futuras operaciones de SDK', async () => {
  const serialized = createOperationQueue();
  await assert.rejects(serialized(async () => { throw new Error('cancelled'); }));
  assert.equal(await serialized(async () => 'next-operation'), 'next-operation');
});

test('el rollback de un registro anterior termina antes de volver a registrar el mismo token', async () => {
  const serialized = createOperationQueue();
  let current = true;
  const guard = await captureExpectedSession(accountA, async () => sessionA, () => current);
  const calls: string[] = [];
  let release: (() => void) | undefined;
  const pending = new Promise<void>(resolve => { release = resolve; });
  let rollbackStarted: (() => void) | undefined;
  const started = new Promise<void>(resolve => { rollbackStarted = resolve; });
  const oldRegistration = serialized(() => commitPushRegistration(guard, {
    register: async () => { calls.push('old-register-A'); current = false; },
    persist: async () => { calls.push('old-persist-A'); },
    rollback: async () => { calls.push('old-rollback-start'); rollbackStarted!(); await pending; calls.push('old-rollback-done'); },
  }));
  const rejected = assert.rejects(oldRegistration, SessionChangedError);
  const newRegistration = serialized(async () => { calls.push('new-register-A-same-token'); });
  await started;
  assert.deepEqual(calls, ['old-register-A', 'old-rollback-start']);
  release!();
  await Promise.all([rejected, newRegistration]);
  assert.deepEqual(calls, ['old-register-A', 'old-rollback-start', 'old-rollback-done', 'new-register-A-same-token']);
});

test('una respuesta de registro perdida compensa el posible commit del servidor', async () => {
  const guard = await captureExpectedSession(accountA, async () => sessionA);
  const calls: string[] = [];
  await assert.rejects(commitPushRegistration(guard, {
    register: async () => { calls.push('committed-A-but-response-lost'); throw new Error('Network request failed'); },
    persist: async () => { calls.push('persist'); },
    rollback: async () => { calls.push('remove-owned-A'); },
  }), /Network request failed/);
  assert.deepEqual(calls, ['committed-A-but-response-lost', 'remove-owned-A']);
});

test('el listener y el evento del inicio frío abren cada notificación una sola vez', async () => {
  const opened: string[] = [];
  let cleared = 0;
  const consume = createNotificationTapConsumer(id => opened.push(id), async () => { cleared += 1; });
  const response = { actionIdentifier: 'default', notification: { request: { identifier: 'notification-1', content: { data: { placeId: accountA } } } } };
  consume(response);
  consume(response);
  await Promise.resolve();
  assert.deepEqual(opened, [accountA]);
  assert.equal(cleared, 1);
});

test('notificaciones distintas al mismo lugar y acciones distintas no se pierden', () => {
  const opened: string[] = [];
  const consume = createNotificationTapConsumer(id => opened.push(id), async () => {});
  for (const [identifier, actionIdentifier] of [['notification-1', 'default'], ['notification-2', 'default'], ['notification-2', 'another-action']]) {
    consume({ actionIdentifier, notification: { request: { identifier, content: { data: { placeId: accountA } } } } });
  }
  assert.equal(opened.length, 3);
});

test('eventos inválidos o entregados después de desmontar no navegan', () => {
  const opened: string[] = [];
  const consume = createNotificationTapConsumer(id => opened.push(id), async () => {}, () => true);
  consume({ actionIdentifier: 'default', notification: { request: { identifier: 'old', content: { data: { placeId: accountA } } } } });
  assert.deepEqual(opened, []);
  const active = createNotificationTapConsumer(id => opened.push(id), async () => {});
  active({ actionIdentifier: 'default', notification: { request: { identifier: 'invalid', content: { data: { placeId: '-'.repeat(36) } } } } });
  assert.deepEqual(opened, []);
});

test('un fallo al borrar el último evento no produce un rechazo sin gestionar', async () => {
  const opened: string[] = [];
  const consume = createNotificationTapConsumer(id => opened.push(id), async () => { throw new Error('native unavailable'); });
  consume({ actionIdentifier: 'default', notification: { request: { identifier: 'one', content: { data: { placeId: accountA } } } } });
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.deepEqual(opened, [accountA]);
});
