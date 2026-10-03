import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SLRC_CENTER, isPreviewPlace, previewPlaces } from '../src/data/preview';
import { validatePublication } from '../src/domain/publication';
import { cameraRegion, mapCamera } from '../src/maps/camera';
import { mapDocument, mapUpdate } from '../src/maps/document';
import { parseMapMessage } from '../src/maps/types';
import { createMapLocationStore, type MapLocationResult } from '../src/state/mapLocationStore';

const actualPosition = { latitude: 29.07, longitude: -110.95, accuracy: 2400, timestamp: '2026-10-03T18:00:00Z' };

test('opening the map repeatedly requests location once per app session', async () => {
  let reads = 0;
  let resolve!: (result: MapLocationResult) => void;
  const store = createMapLocationStore(() => { reads++; return new Promise(result => { resolve = result; }); });
  const first = store.start();
  await Promise.resolve();
  assert.equal(store.getSnapshot().status, 'locating');
  assert.equal(store.start(), first);
  assert.equal(store.locate(), first);
  assert.equal(reads, 1);
  resolve({ position: actualPosition });
  await first;
  await store.start();
  assert.equal(reads, 1);
  assert.equal(store.getSnapshot().status, 'ready');
  assert.deepEqual(store.getSnapshot().position, actualPosition);
});

test('denied location does not turn the SLRC example center into a user position', async () => {
  let reads = 0;
  const store = createMapLocationStore(async () => { reads++; return { status: 'denied', error: 'Sin permiso', canAskAgain: false }; });
  await store.start();
  assert.deepEqual(store.getSnapshot(), { status: 'denied', error: 'Sin permiso', canAskAgain: false, position: null });
  await store.start();
  assert.equal(reads, 1);
  await store.locate();
  assert.equal(reads, 2);
});

test('explicit retry can recover after a GPS error and informs subscribers', async () => {
  let reads = 0;
  const observed: string[] = [];
  const store = createMapLocationStore(async () => ++reads === 1
    ? { status: 'unavailable', error: 'Ubicación apagada', canAskAgain: true }
    : { position: actualPosition });
  const unsubscribe = store.subscribe(() => observed.push(store.getSnapshot().status));
  await store.start();
  await store.locate();
  unsubscribe();
  assert.deepEqual(observed, ['locating', 'unavailable', 'locating', 'ready']);
  assert.equal(store.getSnapshot().error, null);
  assert.deepEqual(store.getSnapshot().position, actualPosition);
});

test('unexpected location failures leave a usable retryable map state', async () => {
  const store = createMapLocationStore(async () => { throw new Error('native failure'); });
  await store.start();
  assert.equal(store.getSnapshot().status, 'error');
  assert.equal(store.getSnapshot().position, null);
  assert.equal(store.getSnapshot().canAskAgain, true);
});

test('approximate navigation location does not relax the free publication GPS rule', async () => {
  const store = createMapLocationStore(async () => ({ position: actualPosition }));
  await store.start();
  assert.equal(store.getSnapshot().status, 'ready');
  assert.throws(() => validatePublication({ requestId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', title: 'Un parque', category: 'naturaleza', latitude: actualPosition.latitude, longitude: actualPosition.longitude, photo: { uri: 'file:///photo.jpg', source: 'camera', capturedAt: actualPosition.timestamp, biometricVerified: true } }, false, { ...actualPosition, mocked: false }, Date.parse(actualPosition.timestamp)), /precisión/i);
});

test('GPS center wins over distant demo markers and stays stable during selection/feed changes', () => {
  const initial = mapUpdate({ center: actualPosition, origin: actualPosition, places: previewPlaces });
  const selected = mapUpdate({ center: actualPosition, origin: actualPosition, places: [...previewPlaces].reverse(), selectedId: previewPlaces[0].id });
  assert.deepEqual(initial.camera.center, actualPosition);
  assert.equal(initial.camera.key, selected.camera.key);
  assert.equal(selected.selectedId, previewPlaces[0].id);
});

test('explicit centering request recenters even when its coordinate is unchanged', () => {
  const first = mapCamera({ cameraRequest: { id: 1, center: actualPosition, zoom: 15 } });
  const retry = mapCamera({ cameraRequest: { id: 2, center: actualPosition, zoom: 15 } });
  assert.deepEqual(first.center, retry.center);
  assert.notEqual(first.key, retry.key);
  const region = cameraRegion(first.center, first.zoom);
  assert.equal(region.latitude, actualPosition.latitude);
  assert.equal(region.longitude, actualPosition.longitude);
  assert.ok(region.latitudeDelta > 0);
});

test('invalid camera coordinates fall back to examples while missing GPS stays null', () => {
  const update = mapUpdate({ center: { latitude: NaN, longitude: 200 } });
  assert.deepEqual(update.camera.center, SLRC_CENTER);
  assert.equal(update.origin, null);
  assert.equal(mapCamera({ cameraRequest: { id: 1, center: SLRC_CENTER, zoom: NaN } }).zoom, 14);
});

test('the SLRC camera region includes all six examples without using them as GPS', () => {
  const camera = mapCamera({ cameraRequest: { id: 0, center: SLRC_CENTER, zoom: 12 } });
  const region = cameraRegion(camera.center, camera.zoom);
  for (const place of previewPlaces) {
    assert.ok(Math.abs(place.latitude - region.latitude) < region.latitudeDelta / 2, place.title);
    assert.ok(Math.abs(place.longitude - region.longitude) < region.longitudeDelta / 2, place.title);
  }
});

test('map bridge rejects foreign or invalid selection messages', () => {
  assert.equal(parseMapMessage({ derivaMap: 'other', type: 'place', id: 'demo-1' }, 'this'), null);
  assert.equal(parseMapMessage({ derivaMap: 'this', type: 'coordinate', latitude: 100, longitude: 0 }, 'this'), null);
  assert.deepEqual(parseMapMessage({ derivaMap: 'this', type: 'coordinate', latitude: 32.46, longitude: -114.77 }, 'this'), { derivaMap: 'this', type: 'coordinate', latitude: 32.46, longitude: -114.77 });
});

test('place titles cannot break out of the map document into executable markup', () => {
  const title = '</script><script>alert(1)</script>';
  const html = mapDocument({ places: [{ ...previewPlaces[0], title }] }, 'map-bridge');
  assert.equal(html.includes(title), false);
  assert.ok(html.includes('label.textContent=p.title'));
});

test('all six examples stay local and are in the SLRC area', () => {
  assert.equal(previewPlaces.length, 6);
  for (const place of previewPlaces) {
    assert.equal(isPreviewPlace(place), true);
    assert.equal(isPreviewPlace(place.id), true);
    assert.equal(place.photo_path, '');
    assert.ok(place.latitude > 32.40 && place.latitude < 32.51);
    assert.ok(place.longitude > -114.83 && place.longitude < -114.73);
  }
  assert.equal(isPreviewPlace('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'), false);
});
