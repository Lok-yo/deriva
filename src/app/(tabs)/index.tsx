import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SLRC_CENTER } from '../../data/preview';
import type { Coordinate } from '../../domain/models';
import { MapView } from '../../maps/MapView';
import type { MapProps } from '../../maps/types';
import { useApp } from '../../state/AppProvider';
import { Brand } from '../../ui/AppShell';
import { Button } from '../../ui/Button';
import { PlacePhoto } from '../../ui/PlacePhoto';
import { colors, type } from '../../ui/theme';

export default function Explore() {
  const app = useApp();
  const location = app.mapLocation;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newPoint, setNewPoint] = useState<Coordinate | null>(null);
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
  function selectPoint(coordinate: Coordinate) {
    autoCenter.current = false; centerNextLocation.current = false;
    setSelectedId(null); setNewPoint(coordinate);
  }
  function createHere() {
    if (!newPoint) return;
    router.navigate({ pathname: '/publish', params: { mode: 'remote', latitude: String(newPoint.latitude), longitude: String(newPoint.longitude) } });
  }
  function surprise() {
    if (!app.places.length) return;
    const options = app.places.filter(item => item.id !== selectedId);
    const choices = options.length ? options : app.places;
    const chosen = choices[Math.floor(Math.random() * choices.length)];
    autoCenter.current = false; centerNextLocation.current = false;
    setNewPoint(null); setSelectedId(chosen.id);
    setCameraRequest({ id: ++nextCamera.current, center: chosen, zoom: 16 });
  }

  return <View style={styles.screen} testID="map-screen">
    <MapView
      places={app.places}
      origin={position}
      cameraRequest={cameraRequest}
      selectedId={selectedId}
      selected={newPoint}
      selectable
      onSelectCoordinate={selectPoint}
      onSelectPlace={id => { autoCenter.current = false; centerNextLocation.current = false; setNewPoint(null); setSelectedId(id); }}
      edgeToEdge
      style={styles.map}
    />
    <View pointerEvents="box-none" style={styles.top}>
      <View style={styles.brand}><Brand small /></View>
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
      {newPoint ? <View style={styles.newPoint} testID="new-point-prompt">
        <View style={styles.promptHeading}>
          <Text accessibilityRole="header" style={[type.heading, { flex: 1 }]}>Un nuevo lugar</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Cancelar nueva ubicación" onPress={() => setNewPoint(null)} style={styles.dismiss}><Ionicons name="close" size={21} color={colors.muted} /></Pressable>
        </View>
        <Text style={type.body}>{app.isAdmin ? 'Puedes agregar una ubicación aquí gratis como administrador.' : app.remoteCredits > 0 ? 'Ya tienes un pago disponible para agregar una ubicación aquí.' : 'Agregar una ubicación aquí cuesta 1 USD.'}</Text>
        <Button label={!app.session ? 'Iniciar sesión para continuar' : app.isAdmin || app.remoteCredits > 0 ? 'Agregar ubicación' : 'Continuar por 1 USD'} icon="add-outline" onPress={createHere} />
      </View> : place ? <View style={styles.place} testID="selected-place">
        <Pressable accessibilityRole="button" accessibilityLabel={`Ver ${place.title}`} onPress={() => router.push({ pathname: '/place/[id]', params: { id: place.id } })} style={({ pressed }) => [styles.placeContent, pressed && styles.pressed]}>
          <PlacePhoto uri={place.photoUrl} label={`Foto de ${place.title}`} compact style={styles.thumbnail} />
          <Text accessibilityRole="header" numberOfLines={2} style={styles.placeTitle}>{place.title}</Text>
          <Ionicons name="chevron-forward" size={21} color={colors.green} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar lugar seleccionado" onPress={() => setSelectedId(null)} style={styles.dismiss}>
          <Ionicons name="close" size={21} color={colors.muted} />
        </Pressable>
      </View> : <View pointerEvents="none" style={styles.hint}>
        <Text style={styles.hintText}>{location.status === 'locating' ? 'Buscando tu ubicación…' : 'Toca un ? para descubrir un lugar'}</Text>
      </View>}
    </View>
  </View>;
}

const floating = { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, boxShadow: '0px 3px 12px #00000035' };
const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: 0, backgroundColor: colors.soft },
  map: { flex: 1 },
  top: { position: 'absolute', top: 16, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between' },
  brand: { ...floating, paddingHorizontal: 13, minHeight: 48, borderRadius: 16, justifyContent: 'center' },
  controlLabel: { color: colors.ink, fontWeight: '600', fontSize: 14, lineHeight: 20 },
  notice: { ...floating, position: 'absolute', top: 76, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 12, paddingVertical: 3, borderRadius: 12 },
  noticeText: { flex: 1, color: colors.ink, fontSize: 13, lineHeight: 19 },
  dismiss: { width: 44, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  bottom: { position: 'absolute', bottom: 16, left: 16, right: 16, gap: 12 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  random: { ...floating, minHeight: 48, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 24 },
  locate: { ...floating, width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24 },
  place: { ...floating, flexDirection: 'row', alignItems: 'center', borderRadius: 18 },
  placeContent: { flex: 1, flexDirection: 'row', alignItems: 'center', minHeight: 86, paddingLeft: 10, paddingVertical: 10, gap: 12 },
  thumbnail: { width: 58, height: 64, borderRadius: 10 },
  placeTitle: { flex: 1, color: colors.ink, fontWeight: '600', fontSize: 17, lineHeight: 23 },
  newPoint: { ...floating, padding: 18, paddingTop: 6, borderRadius: 20, gap: 12 },
  promptHeading: { flexDirection: 'row', alignItems: 'center' },
  hint: { ...floating, alignItems: 'center', alignSelf: 'center', maxWidth: '100%', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16 },
  hintText: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  pressed: { opacity: 0.7 },
});
