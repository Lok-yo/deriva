import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardinalDirection, chooseDrift, describeHeading, nextDiscovery, rankNearby } from '../src/domain/geo';
import type { Place } from '../src/domain/models';
import { createDiscoveryStore } from '../src/state/discoveryStore';

const origin = { latitude: 0, longitude: 0 };
const at = (id: string, latitude: number, longitude: number) => ({ id, latitude, longitude, title: id }) as Place;
const north = at('north', 0.01, 0);
const east = at('east', 0, 0.02);
const far = at('far', 1, 1);

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
test('la deriva prefiere lo no descubierto y no repite el lugar actual', () => {
  assert.equal(chooseDrift([north, east], origin, new Set(['north']), null, 10, () => 0)?.id, 'east');
  assert.equal(chooseDrift([north, east], origin, new Set(), 'north', 10, () => 0)?.id, 'east');
  assert.equal(chooseDrift([north], origin, new Set(['north']), 'north', 10, () => 0)?.id, 'north');
  assert.equal(chooseDrift([far], origin, new Set(), null, 1, () => 0)?.id, 'far');
  assert.equal(chooseDrift([], origin, new Set(), null), null);
});
test('el siguiente hallazgo es el más cercano sin descubrir', () => {
  assert.equal(nextDiscovery([north, east, far], north, new Set(['east']), 'north')?.place.id, 'far');
  assert.equal(nextDiscovery([north, east], north, new Set(['east']), 'north'), null);
});
test('los descubrimientos se guardan y se recuperan', async () => {
  const memory = new Map<string, string>([['deriva.discovered.v1', '["a", 3]']]);
  const storage = { getItem: async (key: string) => memory.get(key) ?? null, setItem: async (key: string, value: string) => { memory.set(key, value); } };
  const store = createDiscoveryStore(storage);
  await store.discover('b');
  assert.deepEqual([...store.getSnapshot()].sort(), ['a', 'b']);
  assert.deepEqual(JSON.parse(memory.get('deriva.discovered.v1')!).sort(), ['a', 'b']);
  const before = store.getSnapshot();
  await store.discover('a');
  assert.equal(store.getSnapshot(), before);
});
