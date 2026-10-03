import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { isPreviewPlace, SLRC_CENTER } from '../../data/preview';
import { distanceMeters, formatDistance } from '../../domain/geo';
import { MapView } from '../../maps/MapView';
import type { MapProps } from '../../maps/types';
import { useApp } from '../../state/AppProvider';
import { Brand } from '../../ui/AppShell';
import { colors, type } from '../../ui/theme';

export default function Explore() {
  const app = useApp();
  const location = app.mapLocation;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cameraRequest, setCameraRequest] = useState<NonNullable<MapProps['cameraRequest']>>({ id: 0, center: SLRC_CENTER, zoom: 12 });
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  const nextCamera = useRef(0);
  const autoCenter = useRef(true);
  const centerNextLocation = useRef(false);
  const place = app.places.find(item => item.id === selectedId);
  const notice = location.error ?? app.error;
  const startMapLocation = app.startMapLocation;
  const position = location.position;
  useEffect(() => { void startMapLocation(); }, [startMapLocation]);
  useEffect(() => {
    if (position && (autoCenter.current || centerNextLocation.current)) {
      setCameraRequest({ id: ++nextCamera.current, center: position, zoom: 15 });
      autoCenter.current = false;
      centerNextLocation.current = false;
    }
  }, [position]);

  async function locate() {
    setDismissedError(null);
    autoCenter.current = false;
    centerNextLocation.current = true;
    const result = await app.locateMap();
    if (result.status === 'denied' && !result.canAskAgain && Platform.OS !== 'web') {
      await Linking.openSettings().catch(() => {});
    }
  }
  function showExamples() {
    autoCenter.current = false; centerNextLocation.current = false;
    setSelectedId(null);
    setCameraRequest({ id: ++nextCamera.current, center: SLRC_CENTER, zoom: 12 });
  }
  function surprise() {
    if (!app.places.length) return;
    const options = app.places.filter(item => item.id !== selectedId);
    const choices = options.length ? options : app.places;
    const chosen = choices[Math.floor(Math.random() * choices.length)];
    autoCenter.current = false; centerNextLocation.current = false;
    setSelectedId(chosen.id);
    setCameraRequest({ id: ++nextCamera.current, center: chosen, zoom: 16 });
  }

  return <View style={styles.screen} testID="map-screen">
    <MapView
      places={app.places}
      origin={position}
      cameraRequest={cameraRequest}
      selectedId={selectedId}
      onSelectPlace={id => { autoCenter.current = false; centerNextLocation.current = false; setSelectedId(id); }}
      edgeToEdge
      style={styles.map}
    />
    <View pointerEvents="box-none" style={styles.top}>
      <View style={styles.brand}><Brand small /></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Ver ejemplos en San Luis Río Colorado" onPress={showExamples} style={({ pressed }) => [styles.examples, pressed && styles.pressed]}>
        <Ionicons name="location-outline" size={17} color={colors.green} />
        <Text style={styles.controlLabel}>SLRC</Text>
        <Text style={styles.demoLabel}>Ejemplos</Text>
      </Pressable>
    </View>
    {notice && dismissedError !== notice && <View style={styles.notice} accessibilityLiveRegion="polite">
      <Ionicons name="information-circle-outline" size={18} color={colors.ink} />
      <Text style={[type.small, styles.noticeText]}>{notice}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Cerrar aviso de ubicación" onPress={() => setDismissedError(notice)} style={styles.dismiss}>
        <Ionicons name="close" size={20} color={colors.ink} />
      </Pressable>
    </View>}
    <View pointerEvents="box-none" style={styles.bottom}>
      <View pointerEvents="box-none" style={styles.controls}>
        <Pressable accessibilityRole="button" accessibilityLabel="Elegir un lugar al azar" disabled={!app.places.length} onPress={surprise} style={({ pressed }) => [styles.random, pressed && styles.pressed]}>
          <Ionicons name="shuffle-outline" size={20} color={colors.green} />
          <Text style={styles.controlLabel}>Al azar</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={location.status === 'denied' && !location.canAskAgain && Platform.OS !== 'web' ? 'Abrir ajustes de ubicación' : 'Centrar en mi ubicación'} accessibilityState={{ busy: location.status === 'locating', disabled: location.status === 'locating' }} disabled={location.status === 'locating'} onPress={() => void locate()} style={({ pressed }) => [styles.locate, pressed && styles.pressed]}>
          {location.status === 'locating' ? <ActivityIndicator color={colors.green} /> : <Ionicons name="locate-outline" size={23} color={colors.green} />}
        </Pressable>
      </View>
      {place ? <View style={styles.place} testID="selected-place">
        <Pressable accessibilityRole="button" accessibilityLabel={`Ver ${place.title}`} onPress={() => router.push({ pathname: '/place/[id]', params: { id: place.id } })} style={({ pressed }) => [styles.placeContent, pressed && styles.pressed]}>
          <View style={styles.placeText}>
            <Text accessibilityRole="header" numberOfLines={2} style={styles.placeTitle}>{place.title}</Text>
            <Text style={type.small}>{isPreviewPlace(place) ? 'Ejemplo local · SLRC' : place.authorName}{position ? ` · ${formatDistance(distanceMeters(position, place))}` : ''}</Text>
          </View>
          <Ionicons name="chevron-forward" size={21} color={colors.green} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar lugar seleccionado" onPress={() => setSelectedId(null)} style={styles.dismiss}>
          <Ionicons name="close" size={21} color={colors.muted} />
        </Pressable>
      </View> : <View pointerEvents="none" style={styles.hint}>
        <Text style={styles.hintText}>{location.status === 'locating' ? 'Buscando tu ubicación…' : position ? 'Toca un punto para descubrirlo' : 'Explora SLRC o activa tu ubicación'}</Text>
      </View>}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: 0, backgroundColor: colors.soft },
  map: { flex: 1 },
  top: { position: 'absolute', top: 16, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  brand: { paddingHorizontal: 13, minHeight: 48, backgroundColor: colors.surface, borderRadius: 14, justifyContent: 'center', boxShadow: '0px 2px 8px #20332B14' },
  examples: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, borderRadius: 14, backgroundColor: colors.surface, boxShadow: '0px 2px 8px #20332B14' },
  controlLabel: { color: colors.green, fontWeight: '600', fontSize: 14, lineHeight: 20 },
  demoLabel: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  notice: { position: 'absolute', top: 76, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 12, paddingVertical: 3, borderRadius: 12, backgroundColor: colors.surface, boxShadow: '0px 2px 8px #20332B14' },
  noticeText: { flex: 1, color: colors.ink, fontSize: 13, lineHeight: 19 },
  dismiss: { width: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  bottom: { position: 'absolute', bottom: 16, left: 16, right: 16, gap: 10 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  random: { minHeight: 48, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: colors.surface, borderRadius: 24, boxShadow: '0px 2px 8px #20332B14' },
  locate: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderRadius: 24, boxShadow: '0px 2px 8px #20332B14' },
  place: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 16, boxShadow: '0px 3px 12px #20332B1C' },
  placeContent: { flex: 1, flexDirection: 'row', alignItems: 'center', minHeight: 86, paddingLeft: 16, paddingVertical: 14, gap: 12 },
  placeText: { flex: 1, gap: 5 },
  placeTitle: { color: colors.ink, fontWeight: '600', fontSize: 17, lineHeight: 23 },
  hint: { alignItems: 'center', alignSelf: 'center', maxWidth: '100%', paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.surface, borderRadius: 14 },
  hintText: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  pressed: { opacity: 0.7 },
});
