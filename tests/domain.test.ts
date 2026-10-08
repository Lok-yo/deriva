import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bearingDegrees, chooseRandomPlace, distanceMeters, formatDistance, relativeHeading } from '../src/domain/geo';
import { publicationAccess, publicationTarget, resolvePublicationDraft, validatePublication } from '../src/domain/publication';
import type { Place, Position, PublishDraft } from '../src/domain/models';

const origin = { latitude: 29.072, longitude: -110.956 };
const gps: Position = { ...origin, accuracy: 12, timestamp: new Date().toISOString(), mocked: false };
const draft: PublishDraft = { ...origin, requestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', title: 'Mirador del desierto', mode: 'local', photo: { uri: 'file:///photo.jpg', source: 'camera', capturedAt: new Date().toISOString(), biometricVerified: true } };
test('distancias geográficas: cero, un grado y cruce del antimeridiano', () => {
  assert.equal(distanceMeters(origin, origin), 0);
  assert.ok(Math.abs(distanceMeters({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 }) - 111195) < 5);
  assert.ok(distanceMeters({ latitude: 0, longitude: 179.99 }, { latitude: 0, longitude: -179.99 }) < 2300);
});
test('brújula: norte, este y giro breve al cruzar 360°', () => {
  assert.equal(bearingDegrees({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 }), 0);
  assert.equal(bearingDegrees({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }), 90);
  assert.equal(relativeHeading(5, 355), 10);
  assert.equal(relativeHeading(355, 5), -10);
});
test('una elección aleatoria nunca ofrece destinos fuera del radio', () => {
  const near = { ...origin, id: 'near' } as Place;
  const far = { latitude: 50, longitude: 30, id: 'far' } as Place;
  assert.equal(chooseRandomPlace([far, near], origin, 1, () => 0)?.id, 'near');
  assert.equal(chooseRandomPlace([far], origin, 1), null);
  assert.equal(chooseRandomPlace([], null, 10), null);
});
test('distancia para lectores en español', () => {
  assert.equal(formatDistance(240), '240 m');
  assert.equal(formatDistance(1200), '1.2 km');
});
test('publicación gratuita válida y título normalizado', () => {
  assert.equal(validatePublication({ ...draft, title: '  Un lugar  ' }, { isAdmin: false, remoteCredits: 0, visits: 0, requiredVisits: 3 }, gps).title, 'Un lugar');
});
test('el plan gratuito rechaza galería, biometría ausente y coordenadas remotas', () => {
  assert.throws(() => validatePublication({ ...draft, photo: { ...draft.photo, source: 'gallery' } }, { isAdmin: false, remoteCredits: 0, visits: 0, requiredVisits: 3 }, gps), /cámara/i);
  assert.throws(() => validatePublication({ ...draft, photo: { ...draft.photo, biometricVerified: false } }, { isAdmin: false, remoteCredits: 0, visits: 0, requiredVisits: 3 }, gps), /biometr/i);
  assert.throws(() => validatePublication({ ...draft, latitude: 40 }, { isAdmin: false, remoteCredits: 0, visits: 0, requiredVisits: 3 }, gps), /ubicación/i);
});
test('el plan gratuito rechaza GPS antiguo, impreciso y simulado', () => {
  assert.throws(() => validatePublication(draft, { isAdmin: false, remoteCredits: 0, visits: 0, requiredVisits: 3 }, { ...gps, timestamp: new Date(Date.now() - 180000).toISOString() }), /GPS/i);
  assert.throws(() => validatePublication(draft, { isAdmin: false, remoteCredits: 0, visits: 0, requiredVisits: 3 }, { ...gps, accuracy: 500 }), /precisión/i);
  assert.throws(() => validatePublication(draft, { isAdmin: false, remoteCredits: 0, visits: 0, requiredVisits: 3 }, { ...gps, mocked: true }), /simulada/i);
});
test('Administrador permite galería y punto remoto, pero cámara sigue exigiendo biometría', () => {
  assert.equal(validatePublication({ ...draft, mode: 'remote', latitude: 40, photo: { ...draft.photo, source: 'gallery', biometricVerified: false } }, { isAdmin: true, remoteCredits: 0, visits: 0, requiredVisits: 3 }, null).latitude, 40);
  assert.throws(() => validatePublication({ ...draft, photo: { ...draft.photo, biometricVerified: false } }, { isAdmin: true, remoteCredits: 0, visits: 0, requiredVisits: 3 }, null), /biometr/i);
});
test('rechaza títulos inválidos, modos desconocidos y coordenadas no finitas', () => {
  for (const title of ['', 'ab', 'x'.repeat(81)]) assert.throws(() => validatePublication({ ...draft, title }, { isAdmin: true, remoteCredits: 0, visits: 0, requiredVisits: 3 }, null), /título/i);
  for (const latitude of [NaN, Infinity, 91]) assert.throws(() => validatePublication({ ...draft, latitude }, { isAdmin: true, remoteCredits: 0, visits: 0, requiredVisits: 3 }, null), /coordenadas/i);
  assert.throws(() => validatePublication({ ...draft, mode: 'bad' as never }, { isAdmin: true, remoteCredits: 0, visits: 0, requiredVisits: 3 }, null), /cómo publicar/i);
});

test('remoto consume acceso por punto y local nunca hereda privilegios de admin', () => {
  const remote = { ...draft, mode: 'remote' as const, latitude: 40, photo: { ...draft.photo, source: 'gallery' as const, biometricVerified: false } };
  assert.throws(() => validatePublication(remote, { isAdmin: false, remoteCredits: 1, visits: 2, requiredVisits: 3 }, null), /Visita 3 lugares.*Llevas 2\/3/);
  assert.throws(() => validatePublication(remote, { isAdmin: false, remoteCredits: 0, visits: 3, requiredVisits: 3 }, null), /1 USD/);
  assert.equal(validatePublication(remote, { isAdmin: false, remoteCredits: 1, visits: 3, requiredVisits: 3 }, null).latitude, 40);
  assert.throws(() => validatePublication({ ...remote, mode: 'local' }, { isAdmin: true, remoteCredits: 0, visits: 0, requiredVisits: 3 }, gps), /cámara/i);
});
test('publicación local toma GPS fresco aunque fallara ubicación anterior', () => {
  const input = { requestId: draft.requestId, title: draft.title, photo: draft.photo, mode: 'local' as const };
  const resolved = resolvePublicationDraft(input, gps);
  assert.deepEqual({ latitude: resolved.latitude, longitude: resolved.longitude }, origin);
  assert.equal(validatePublication(resolved, { isAdmin: false, remoteCredits: 0, visits: 0, requiredVisits: 3 }, gps).title, draft.title);
  assert.throws(() => resolvePublicationDraft(input, null), /GPS/);
  assert.equal(resolvePublicationDraft({ ...draft, latitude: 40 }, gps).latitude, gps.latitude);
});
test('parámetros remotos conservan coordenadas sin conferir acceso', () => {
  assert.deepEqual(publicationTarget({ mode: 'remote', latitude: '32.46', longitude: '-114.77' }), { mode: 'remote', coordinate: { latitude: 32.46, longitude: -114.77 } });
  for (const latitude of ['', 'NaN', '91', ['32.46']]) assert.equal(publicationTarget({ mode: 'remote', latitude, longitude: '-114.77' }).coordinate, null);
  assert.deepEqual(publicationAccess({ is_admin: 'true', remote_credits: '1', visits: '4', required_visits: 0 }), { isAdmin: false, remoteCredits: 0, visits: 0, requiredVisits: 3 });
  assert.deepEqual(publicationAccess({ is_admin: true, remote_credits: 2, visits: 5, required_visits: 3 }), { isAdmin: true, remoteCredits: 2, visits: 5, requiredVisits: 3 });
  assert.deepEqual(publicationAccess(null), { isAdmin: false, remoteCredits: 0, visits: 0, requiredVisits: 3 });
});
