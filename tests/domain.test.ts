import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bearingDegrees, chooseRandomPlace, distanceMeters, formatDistance, relativeHeading } from '../src/domain/geo';
import { validatePublication } from '../src/domain/publication';
import type { Place, Position, PublishDraft } from '../src/domain/models';

const origin = { latitude: 29.072, longitude: -110.956 };
const gps: Position = { ...origin, accuracy: 12, timestamp: new Date().toISOString(), mocked: false };
const draft: PublishDraft = { ...origin, requestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', title: 'Mirador del desierto', category: 'naturaleza', photo: { uri: 'file:///photo.jpg', source: 'camera', capturedAt: new Date().toISOString(), biometricVerified: true } };
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
  assert.equal(validatePublication({ ...draft, title: '  Un lugar  ' }, false, gps).title, 'Un lugar');
});
test('el plan gratuito rechaza galería, biometría ausente y coordenadas remotas', () => {
  assert.throws(() => validatePublication({ ...draft, photo: { ...draft.photo, source: 'gallery' } }, false, gps), /cámara/i);
  assert.throws(() => validatePublication({ ...draft, photo: { ...draft.photo, biometricVerified: false } }, false, gps), /biometr/i);
  assert.throws(() => validatePublication({ ...draft, latitude: 40 }, false, gps), /ubicación/i);
});
test('el plan gratuito rechaza GPS antiguo, impreciso y simulado', () => {
  assert.throws(() => validatePublication(draft, false, { ...gps, timestamp: new Date(Date.now() - 180000).toISOString() }), /GPS/i);
  assert.throws(() => validatePublication(draft, false, { ...gps, accuracy: 500 }), /precisión/i);
  assert.throws(() => validatePublication(draft, false, { ...gps, mocked: true }), /simulada/i);
});
test('Premium permite galería y punto remoto, pero cámara sigue exigiendo biometría', () => {
  assert.equal(validatePublication({ ...draft, latitude: 40, photo: { ...draft.photo, source: 'gallery', biometricVerified: false } }, true, null).latitude, 40);
  assert.throws(() => validatePublication({ ...draft, photo: { ...draft.photo, biometricVerified: false } }, true, null), /biometr/i);
});
test('rechaza títulos inválidos, categorías desconocidas y coordenadas no finitas', () => {
  for (const title of ['', 'ab', 'x'.repeat(81)]) assert.throws(() => validatePublication({ ...draft, title }, true, null), /título/i);
  for (const latitude of [NaN, Infinity, 91]) assert.throws(() => validatePublication({ ...draft, latitude }, true, null), /coordenadas/i);
  assert.throws(() => validatePublication({ ...draft, category: 'bad' as never }, true, null), /categoría/i);
});
