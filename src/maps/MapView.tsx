import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';
import { EmbeddedMapView } from './EmbeddedMapView';
import { NativeMapView } from './NativeMapView';
import type { MapProps } from './types';

export function MapView(props: MapProps) {
  // SDK 57's Google renderer can remain black inside Android Expo Go (Expo #49323).
  // The embedded map bypasses that renderer while keeping the same mobile controls.
  return Platform.OS === 'android' && isRunningInExpoGo()
    ? <EmbeddedMapView {...props} />
    : <NativeMapView {...props} />;
}
