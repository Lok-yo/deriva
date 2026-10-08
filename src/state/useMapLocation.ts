import { useState, useSyncExternalStore } from 'react';
import { readMapLocation } from '../services/mapLocation';
import { watchPosition } from '../services/sensors';
import { createMapLocationStore } from './mapLocationStore';

export function useMapLocation() {
  const [store] = useState(() => createMapLocationStore(readMapLocation, watchPosition));
  const location = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return { location, start: store.start, locate: store.locate, follow: store.follow };
}
