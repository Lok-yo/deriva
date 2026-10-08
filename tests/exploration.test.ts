import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { previewPlaces } from '../src/data/preview';
import { ARRIVAL_RADIUS_M, REQUIRED_VISITS, arrivalCandidate, arrivalReading, countsAsVisit, remoteUnlocked, visitResult, visitsLeft } from '../src/domain/exploration';
import { cardinalDirection, chooseDrift, describeHeading, nextDiscovery, rankNearby } from '../src/domain/geo';
import type { Place } from '../src/domain/models';

const origin = { latitude: 0, longitude: 0 };
const at = (id: string, latitude: number, longitude: number, owner_id = 'someone') => ({ id, latitude, longitude, title: id, owner_id }) as Place;
const north = at('north', 0.01, 0);
const east = at('east', 0, 0.02);
const far = at('far', 1, 1);
const migration = readFileSync(new URL('../supabase/migrations/20261008061830_deriva_exploration_visits.sql', import.meta.url), 'utf8');

test('direcciones cardinales en español', () => {
  assert.equal(cardinalDirection(0), 'norte');
  assert.equal(cardinalDirection(44), 'noreste');
  assert.equal(cardinalDirection(180), 'sur');
  assert.equal(cardinalDirection(350), 'norte');
});
test('los lugares cercanos van primero y describen hacia dónde quedan', () => {
  const ranked = rankNearby([far, east, north], origin);
  assert.deepEqual(ranked.map(item => item.place.id), ['north', 'east', 'far']);
  assert.equal(describeHeading(ranked[0]), '1.1 km al norte');
  assert.equal(describeHeading(rankNearby([north], null)[0]), null);
});
test('la deriva prefiere lo no visitado y no repite el lugar actual', () => {
  assert.equal(chooseDrift([north, east], origin, new Set(['north']), null, 10, () => 0)?.id, 'east');
  assert.equal(chooseDrift([north, east], origin, new Set(), 'north', 10, () => 0)?.id, 'east');
  assert.equal(chooseDrift([north], origin, new Set(['north']), 'north', 10, () => 0)?.id, 'north');
  assert.equal(chooseDrift([far], origin, new Set(), null, 1, () => 0)?.id, 'far');
  assert.equal(chooseDrift([], origin, new Set(), null), null);
});
test('el siguiente hallazgo es el más cercano sin visitar', () => {
  assert.equal(nextDiscovery([north, east, far], north, new Set(['east']), 'north')?.place.id, 'far');
  assert.equal(nextDiscovery([north, east], north, new Set(['east']), 'north'), null);
});

test('las ubicaciones de pago se desbloquean con las visitas requeridas', () => {
  const access = { isAdmin: false, remoteCredits: 0, visits: 2, requiredVisits: 3 };
  assert.equal(remoteUnlocked(access), false);
  assert.equal(visitsLeft(access), 1);
  assert.equal(remoteUnlocked({ ...access, visits: 3 }), true);
  assert.equal(visitsLeft({ ...access, visits: 7 }), 0);
  assert.equal(remoteUnlocked({ ...access, isAdmin: true, visits: 0 }), true);
});
test('sólo cuenta una lectura real, precisa y reciente', () => {
  const now = Date.parse('2026-10-08T12:00:00Z');
  const reading = { latitude: 1, longitude: 2, accuracy: 20, timestamp: '2026-10-08T11:59:30Z' };
  assert.deepEqual(arrivalReading(reading, now), { ...reading, mocked: false });
  assert.equal(arrivalReading(null, now), null);
  assert.equal(arrivalReading({ ...reading, mocked: true }, now), null);
  assert.equal(arrivalReading({ ...reading, accuracy: 150 }, now), null);
  assert.equal(arrivalReading({ ...reading, accuracy: null }, now), null);
  assert.equal(arrivalReading({ ...reading, timestamp: '2026-10-08T11:57:00Z' }, now), null);
  assert.equal(arrivalReading({ ...reading, timestamp: 'ayer' }, now), null);
});
test('la llegada elige el lugar pendiente más cercano dentro del radio', () => {
  const here = { latitude: 0, longitude: 0, accuracy: 10, timestamp: new Date().toISOString(), mocked: false };
  const near = at('near', 0.0005, 0);
  const nearer = at('nearer', 0.0002, 0);
  const mine = at('mine', 0, 0, 'me');
  assert.equal(arrivalCandidate([near, nearer, north], here, new Set(), 'me')?.place.id, 'nearer');
  assert.equal(arrivalCandidate([near, nearer], here, new Set(['nearer']), 'me')?.place.id, 'near');
  assert.equal(arrivalCandidate([mine, north], here, new Set(), 'me'), null);
  assert.equal(arrivalCandidate([near], here, new Set(), null), null);
  assert.equal(arrivalCandidate([near], null, new Set(), 'me'), null);
  assert.equal(countsAsVisit(mine, 'me'), false);
  assert.equal(countsAsVisit(previewPlaces[0], 'me'), true);
});
test('la respuesta de la visita se interpreta sin confiar en tipos', () => {
  assert.deepEqual(visitResult({ recorded: true, visits: 3, required_visits: 3, unlocked: true, just_unlocked: true }), { recorded: true, visits: 3, requiredVisits: 3, unlocked: true, justUnlocked: true });
  assert.deepEqual(visitResult({ recorded: 'true', visits: '2', required_visits: -1 }), { recorded: false, visits: 0, requiredVisits: REQUIRED_VISITS, unlocked: false, justUnlocked: false });
  assert.deepEqual(visitResult(null), { recorded: false, visits: 0, requiredVisits: REQUIRED_VISITS, unlocked: false, justUnlocked: false });
});
test('las reglas del cliente coinciden con las de Supabase', () => {
  assert.match(migration, new RegExp(`required_visits\\(\\)[^$]*\\$\\$ select ${REQUIRED_VISITS}; \\$\\$`));
  assert.match(migration, new RegExp(`arrival_radius_meters\\(\\)[^$]*\\$\\$ select ${ARRIVAL_RADIUS_M}\\.0::double precision; \\$\\$`));
  const rows = [...migration.matchAll(/\('(demo-\d+)', (-?\d+\.\d+), (-?\d+\.\d+)\)/g)].map(([, id, latitude, longitude]) => ({ id, latitude: Number(latitude), longitude: Number(longitude) }));
  assert.deepEqual(rows, previewPlaces.map(({ id, latitude, longitude }) => ({ id, latitude, longitude })));
});
