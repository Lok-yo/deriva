import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { EmbeddedMapView } from './EmbeddedMapView';
import { NativeMapView } from './NativeMapView';
import type { MapProps } from './types';

// Android's native map is Google Maps: without an API key in the binary it crashes on mount,
// and in Expo Go SDK 57 it can stay black (Expo #49323). The embedded map needs neither.
const androidNativeMap = Constants.expoConfig?.extra?.androidNativeMap === true;

export function MapView(props: MapProps) {
  return Platform.OS === 'android' && !androidNativeMap
    ? <EmbeddedMapView {...props} />
    : <NativeMapView {...props} />;
}
