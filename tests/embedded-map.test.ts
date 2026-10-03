import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createContext, runInContext } from 'node:vm';
import { previewPlaces, SLRC_CENTER } from '../src/data/preview';
import { mapDocument, mapNativeUpdate } from '../src/maps/document';
import { parseMapMessage, type MapMessage, type MapProps } from '../src/maps/types';

/** Execute the actual inline document without a browser, server or tile downloads. */
function embeddedMap(props: MapProps = {}) {
  const messages: MapMessage[] = [];
  const moves: unknown[] = [];
  const mapEvents: Record<string, (event: unknown) => void> = {};
  const tileEvents: Record<string, () => void> = {};
  const pins: Record<string, { click?: () => void }> = {};
  const map = { setView(center: unknown, zoom: number) { moves.push([center, zoom]); return this; }, on(name: string, callback: (event: unknown) => void) { mapEvents[name] = callback; }, invalidateSize() {} };
  const tiles = { addTo() { return this; }, on(name: string, callback: () => void) { tileEvents[name] = callback; return this; } };
  const context = createContext({
    window: { ReactNativeWebView: { postMessage(value: string) { const message = parseMapMessage(value, 'test-map'); if (message) messages.push(message); } } },
    document: { getElementById() { return {}; }, querySelector() { return { style: {} }; }, createElement() { return { textContent: '' }; } },
    setTimeout() { return 1; }, clearTimeout() {},
    ResizeObserver: class { observe() {} },
    L: {
      map() { return map; }, tileLayer() { return tiles; }, divIcon(icon: unknown) { return icon; },
      marker(_coordinate: unknown, options: { title: string }) {
        const handlers = pins[options.title] = {};
        return { addTo() { return this; }, on(name: string, callback: () => void) { if (name === 'click') handlers.click = callback; }, setLatLng() {}, setIcon() {}, remove() {}, unbindTooltip() { return this; }, bindTooltip() { return this; } };
      },
    },
  });
  runInContext('window.L=L', context);
  const html = mapDocument(props, 'test-map', 'native');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  runInContext(script, context);
  runInContext('init()', context);
  return {
    messages, moves, mapEvents, pins, tiles: tileEvents,
    update(next: MapProps, bridge = 'test-map') { runInContext(mapNativeUpdate(next, bridge), context); },
  };
}

test('an initialized embedded map becomes ready only after cartography loads', () => {
  const map = embeddedMap();
  assert.deepEqual(map.messages.map(message => message.type), ['initialized']);
  map.tiles.loading();
  map.tiles.tileload();
  assert.equal(map.messages.some(message => message.type === 'ready'), false);
  map.tiles.load();
  assert.equal(map.messages.at(-1)?.type, 'ready');
});

test('failed tiles show an error, and successful loading can recover', () => {
  const map = embeddedMap();
  map.tiles.loading();
  for (let i = 0; i < 6; i++) map.tiles.tileerror();
  map.tiles.load();
  assert.equal(map.messages.at(-1)?.type, 'error');
  assert.equal(map.messages.some(message => message.type === 'ready'), false);
  map.tiles.loading();
  map.tiles.tileload();
  map.tiles.load();
  assert.equal(map.messages.at(-1)?.type, 'ready');
});

test('native bridge changes selection and markers without resetting the camera', () => {
  const cameraRequest = { id: 0, center: SLRC_CENTER, zoom: 12 };
  const props = { places: previewPlaces, cameraRequest };
  const map = embeddedMap(props);
  const initialMoves = map.moves.length;
  map.update({ ...props, selectedId: previewPlaces[0].id, places: [...previewPlaces].reverse() });
  assert.equal(map.moves.length, initialMoves);
  map.pins[previewPlaces[0].title].click?.();
  assert.equal(map.messages.at(-1)?.type, 'place');
  assert.equal(map.messages.at(-1)?.id, previewPlaces[0].id);
  map.update({ ...props, cameraRequest: { ...cameraRequest, id: 1 } });
  assert.equal(map.moves.length, initialMoves + 1);
  map.update({ ...props, cameraRequest: { id: 2, center: { latitude: 0, longitude: 0 }, zoom: 15 } }, 'foreign-map');
  assert.equal(map.moves.length, initialMoves + 1);
});

test('native point selection respects the selector mode and validates its coordinates', () => {
  const map = embeddedMap();
  const click = { latlng: { lat: 32.46, lng: -114.77 } };
  map.mapEvents.click(click);
  assert.equal(map.messages.some(message => message.type === 'coordinate'), false);
  map.update({ selectable: true });
  map.mapEvents.click(click);
  assert.equal(map.messages.at(-1)?.type, 'coordinate');
  assert.equal(map.messages.at(-1)?.latitude, 32.46);
  assert.ok(Math.abs(map.messages.at(-1)!.longitude! + 114.77) < 1e-10);
  map.mapEvents.click({ latlng: { lat: 100, lng: 0 } });
  assert.equal(map.messages.at(-1)?.latitude, 32.46);
});
