import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ensureNotificationPermission } from '../src/services/notificationsCore';

function api(granted: boolean, canAskAgain: boolean, requestedGranted = true) {
  const calls: string[] = [];
  return { calls,
    async createChannel() { calls.push('channel'); },
    async getPermission() { calls.push('get'); return { granted, canAskAgain }; },
    async requestPermission() { calls.push('request'); return { granted: requestedGranted, canAskAgain: false }; },
  };
}

test('el canal Android se crea antes de solicitar permiso, sin depender de token remoto o sesión', async () => {
  const permissions = api(false, true);
  assert.equal(await ensureNotificationPermission(permissions, true), true);
  assert.deepEqual(permissions.calls, ['channel', 'get', 'request']);
});
test('un permiso ya concedido no abre otro diálogo', async () => {
  const permissions = api(true, true);
  assert.equal(await ensureNotificationPermission(permissions, true), true);
  assert.deepEqual(permissions.calls, ['channel', 'get']);
});
test('la denegación definitiva se respeta sin repetir el permiso', async () => {
  const permissions = api(false, false);
  assert.equal(await ensureNotificationPermission(permissions, true), false);
  assert.deepEqual(permissions.calls, ['channel', 'get']);
});
test('reconciliar un token no solicita permiso y rechazarlo no equivale a concederlo', async () => {
  const permissions = api(false, true, false);
  assert.equal(await ensureNotificationPermission(permissions, false), false);
  assert.deepEqual(permissions.calls, ['channel', 'get']);
  assert.equal(await ensureNotificationPermission(permissions, true), false);
});
