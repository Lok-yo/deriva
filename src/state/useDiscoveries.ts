import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { createDiscoveryStore } from './discoveryStore';

const store = createDiscoveryStore(AsyncStorage);

export function useDiscoveries() {
  const discovered = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return { discovered, discover: store.discover };
}
