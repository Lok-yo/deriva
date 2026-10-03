import { useState, useSyncExternalStore } from 'react';
import { readMapLocation } from '../services/mapLocation';
import { createMapLocationStore } from './mapLocationStore';

export function useMapLocation() {
  const [store] = useState(() => createMapLocationStore(readMapLocation));
  const location = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return { location, start: store.start, locate: store.locate };
}
