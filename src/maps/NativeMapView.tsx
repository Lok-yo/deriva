import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import NativeMap, { Marker } from 'react-native-maps';
import { isPreviewPlace } from '../data/preview';
import { colors } from '../ui/theme';
import { cameraRegion, mapCamera } from './camera';
import { mapStyles } from './MapFeedback';
import type { MapProps } from './types';

/** Phones use their native map, included in Expo Go. */
export function NativeMapView(props: MapProps) {
  const map = useRef<NativeMap>(null);
  const [ready, setReady] = useState(false);
  const camera = mapCamera(props);
  const [initialRegion] = useState(() => cameraRegion(camera.center, camera.zoom));
  const appliedCamera = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || appliedCamera.current === camera.key) return;
    map.current?.animateToRegion(cameraRegion(camera.center, camera.zoom), 350);
    appliedCamera.current = camera.key;
  }, [ready, camera.key, camera.center, camera.zoom]);
  return <View style={[mapStyles.container, props.edgeToEdge && styles.edgeToEdge, props.style]}>
    <NativeMap
      ref={map}
      testID="native-map"
      style={StyleSheet.absoluteFill}
      initialRegion={initialRegion}
      onMapReady={() => setReady(true)}
      onPress={event => { if (props.selectable && event.nativeEvent.action !== 'marker-press') props.onSelectCoordinate?.(event.nativeEvent.coordinate); }}
      showsCompass={false}
      showsMyLocationButton={false}
      showsUserLocation={false}
      toolbarEnabled={false}
      moveOnMarkerPress={false}
      rotateEnabled={false}
      pitchEnabled={false}
      mapPadding={props.edgeToEdge ? { top: 76, right: 12, bottom: 140, left: 12 } : undefined}
    >
      {(props.places ?? []).map(place => <Marker
        key={place.id}
        identifier={place.id}
        coordinate={place}
        accessibilityLabel={`${place.title}${isPreviewPlace(place) ? ', ejemplo en San Luis Río Colorado' : ''}`}
        pinColor={place.id === props.selectedId ? colors.green : isPreviewPlace(place) ? '#7B8F68' : colors.ink}
        onPress={event => { event.stopPropagation(); props.onSelectPlace?.(place.id); }}
      />)}
      {props.origin && <>
        <Marker coordinate={props.origin} anchor={{ x: 0.5, y: 0.5 }} zIndex={100} tracksViewChanges={false} accessibilityLabel="Tu ubicación">
          <View style={styles.origin} />
        </Marker>
      </>}
      {props.selected && <Marker coordinate={props.selected} pinColor={colors.green} accessibilityLabel="Punto elegido" />}
    </NativeMap>
  </View>;
}

const styles = StyleSheet.create({
  edgeToEdge: { borderRadius: 0, borderWidth: 0, minHeight: 0 },
  origin: { width: 19, height: 19, borderRadius: 10, backgroundColor: '#3979D5', borderWidth: 3, borderColor: colors.white },
});
