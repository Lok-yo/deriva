import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import NativeMap, { Marker } from 'react-native-maps';
import { colors } from '../ui/theme';
import { cameraRegion, mapCamera } from './camera';
import { mapStyles } from './MapFeedback';
import type { MapProps } from './types';

const darkMap = [
  { elementType: 'geometry', stylers: [{ color: '#202824' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#202824' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#A5B5AA' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#3F4B43' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#182F3B' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#253D2C' }] },
];

/** iOS, and Android only when the binary carries a Google Maps key. */
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
      userInterfaceStyle="dark"
      customMapStyle={darkMap}
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
        accessibilityLabel={place.title}
        anchor={{ x: 0.5, y: 0.95 }}
        onPress={event => { event.stopPropagation(); props.onSelectPlace?.(place.id); }}
      ><View style={[styles.pin, place.id === props.selectedId && styles.selectedPin]}><Text style={styles.question}>?</Text></View></Marker>)}
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
  pin: { width: 36, height: 36, borderRadius: 18, borderBottomLeftRadius: 5, transform: [{ rotate: '-45deg' }], backgroundColor: colors.lime, borderWidth: 3, borderColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  selectedPin: { backgroundColor: colors.ink, borderColor: colors.lime },
  question: { color: colors.onAccent, fontWeight: '800', fontSize: 20, lineHeight: 25, transform: [{ rotate: '45deg' }] },
  origin: { width: 19, height: 19, borderRadius: 10, backgroundColor: '#3979D5', borderWidth: 3, borderColor: colors.white },
});
