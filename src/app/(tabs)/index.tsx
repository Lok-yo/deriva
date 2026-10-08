import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SLRC_CENTER } from '../../data/preview';
import { chooseDrift, describeHeading, rankNearby } from '../../domain/geo';
import type { Coordinate } from '../../domain/models';
import { MapView } from '../../maps/MapView';
import type { MapProps } from '../../maps/types';
import { useApp } from '../../state/AppProvider';
import { Brand } from '../../ui/AppShell';
import { Button } from '../../ui/Button';
import { ArrivalBanner, ExplorationMeter, unlockSummary } from '../../ui/Exploration';
import { PlacePhoto } from '../../ui/PlacePhoto';
import { colors, type } from '../../ui/theme';
import { useArrival } from '../../ui/useArrival';

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
  const userId = app.session?.user.id;
  const visited = app.visitedIds;
  // Own places never count as a visit, so drift and the "?" treat them as already explored.
  const explored = useMemo(() => new Set([...visited, ...app.places.filter(item => item.owner_id === userId).map(item => item.id)]), [visited, app.places, userId]);
  const place = app.places.find(item => item.id === selectedId);
  const notice = location.error ?? app.error;
  const { startMapLocation, followMapLocation } = app;
  const position = location.position;
  const located = location.status === 'ready';
  const nearby = useMemo(() => rankNearby(app.places, position), [app.places, position]);
  const selectedNearby = place && nearby.find(item => item.place.id === place.id);
  const locked = !!app.session && !app.remoteUnlocked;
  const { arrival, dismiss } = useArrival(position);
  useEffect(() => { void startMapLocation(); }, [startMapLocation]);
  useFocusEffect(useCallback(() => located ? followMapLocation() : undefined, [located, followMapLocation]));
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
  function focusPlace(id: string, center?: Coordinate) {
    autoCenter.current = false; centerNextLocation.current = false;
    setNewPoint(null); setSelectedId(id);
    if (center) setCameraRequest({ id: ++nextCamera.current, center, zoom: 16 });
  }
  function drift() {
    const chosen = chooseDrift(app.places, position, explored, selectedId);
    if (chosen) focusPlace(chosen.id, chosen);
  }
  const status = (id: string, own: boolean) => visited.has(id) ? 'Visitado' : own ? 'Tu lugar' : 'Por visitar';
  const progressLabel = app.remoteUnlocked ? `Desbloqueado. ${app.visitCount} lugares visitados` : `Visitaste ${app.visitCount} de ${app.requiredVisits} lugares para desbloquear las ubicaciones de pago`;

  return <View style={styles.screen} testID="map-screen">
    <MapView
      places={app.places}
      origin={position}
      cameraRequest={cameraRequest}
      selectedId={selectedId}
      selected={newPoint}
      selectable
      onSelectCoordinate={selectPoint}
      onSelectPlace={id => focusPlace(id)}
      edgeToEdge
      style={styles.map}
    />
    <View pointerEvents="box-none" style={styles.top}>
      <View style={styles.brand}><Brand small /></View>
      <Pressable accessibilityRole="button" accessibilityLabel={progressLabel} accessibilityHint="Abre tu progreso de exploración" onPress={() => router.push('/exploration')} style={({ pressed }) => [styles.progress, pressed && styles.pressed]} testID="exploration-progress">
        <Ionicons name={app.remoteUnlocked ? 'lock-open-outline' : 'footsteps-outline'} size={17} color={colors.green} />
        <Text style={styles.progressText}>{app.remoteUnlocked ? app.visitCount : `${Math.min(app.visitCount, app.requiredVisits)}/${app.requiredVisits}`}</Text>
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
      {arrival && <ArrivalBanner arrival={arrival} onDismiss={dismiss} />}
      <View pointerEvents="box-none" style={styles.controls}>
        <Pressable accessibilityRole="button" accessibilityLabel="Ir a la deriva" accessibilityHint="Elige un lugar cercano que aún no has visitado" disabled={!app.places.length} onPress={drift} style={({ pressed }) => [styles.random, pressed && styles.pressed]}>
          <Ionicons name="shuffle-outline" size={20} color={colors.green} />
          <Text style={styles.controlLabel}>A la deriva</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={location.status === 'denied' && !location.canAskAgain && Platform.OS !== 'web' ? 'Abrir ajustes de ubicación' : 'Centrar en mi ubicación'} accessibilityState={{ busy: location.status === 'locating', disabled: location.status === 'locating' }} disabled={location.status === 'locating'} onPress={() => void locate()} style={({ pressed }) => [styles.locate, pressed && styles.pressed]}>
          {location.status === 'locating' ? <ActivityIndicator color={colors.green} /> : <Ionicons name="locate-outline" size={23} color={colors.green} />}
        </Pressable>
      </View>
      {newPoint ? <View style={styles.newPoint} testID="new-point-prompt">
        <View style={styles.promptHeading}>
          <Text accessibilityRole="header" style={[type.heading, { flex: 1 }]}>{locked ? 'Punto bloqueado' : 'Un nuevo lugar'}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Cancelar nueva ubicación" onPress={() => setNewPoint(null)} style={styles.dismiss}><Ionicons name="close" size={21} color={colors.muted} /></Pressable>
        </View>
        {locked ? <>
          <Text style={type.body}>{unlockSummary(app)}</Text>
          <ExplorationMeter visits={app.visitCount} required={app.requiredVisits} />
          <View style={styles.actions}>
            <Button label="Ir a la deriva" icon="shuffle-outline" onPress={drift} style={{ flex: 1 }} />
            <Button label="Mi exploración" icon="footsteps-outline" variant="secondary" onPress={() => router.push('/exploration')} style={{ flex: 1 }} />
          </View>
        </> : <>
          <Text style={type.body}>{app.isAdmin ? 'Puedes agregar una ubicación aquí gratis como administrador.' : app.remoteCredits > 0 ? 'Ya tienes un pago disponible para agregar una ubicación aquí.' : app.session ? 'Exploración completada. Agregar una ubicación aquí cuesta 1 USD.' : `Visita ${app.requiredVisits} lugares con tu cuenta para desbloquear las ubicaciones de pago en cualquier punto.`}</Text>
          <Button label={!app.session ? 'Iniciar sesión para continuar' : app.isAdmin || app.remoteCredits > 0 ? 'Agregar ubicación' : 'Continuar por 1 USD'} icon="add-outline" onPress={createHere} />
        </>}
      </View> : place ? <View style={styles.place} testID="selected-place">
        <Pressable accessibilityRole="button" accessibilityLabel={`Ver ${place.title}`} onPress={() => router.push({ pathname: '/place/[id]', params: { id: place.id } })} style={({ pressed }) => [styles.placeContent, pressed && styles.pressed]}>
          <PlacePhoto uri={place.photoUrl} label={`Foto de ${place.title}`} compact style={styles.thumbnail} />
          <View style={styles.placeCopy}>
            <Text accessibilityRole="header" numberOfLines={2} style={styles.placeTitle}>{place.title}</Text>
            <Text numberOfLines={1} style={styles.meta}>{[selectedNearby && describeHeading(selectedNearby), status(place.id, place.owner_id === userId)].filter(Boolean).join(' · ')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={21} color={colors.green} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar lugar seleccionado" onPress={() => setSelectedId(null)} style={styles.dismiss}>
          <Ionicons name="close" size={21} color={colors.muted} />
        </Pressable>
      </View> : location.status === 'locating' || !nearby.length ? <View pointerEvents="none" style={styles.hint}>
        <Text style={styles.hintText}>{location.status === 'locating' ? 'Buscando tu ubicación…' : 'Toca el mapa para dejar el primer ?'}</Text>
      </View> : <View testID="nearby-places">
        <Text accessibilityRole="header" style={styles.nearbyHeading}>{position ? 'Cerca de ti' : 'Por visitar'}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.nearbyList}>
          {nearby.slice(0, 12).map(item => {
            const own = item.place.owner_id === userId;
            const seen = visited.has(item.place.id);
            const heading = describeHeading(item);
            const label = status(item.place.id, own);
            return <Pressable key={item.place.id} accessibilityRole="button" accessibilityLabel={`${item.place.title}. ${[heading, label].filter(Boolean).join('. ')}`} onPress={() => focusPlace(item.place.id, item.place)} style={({ pressed }) => [styles.nearbyCard, pressed && styles.pressed]}>
              {seen || own ? <PlacePhoto uri={item.place.photoUrl} label={`Foto de ${item.place.title}`} compact style={styles.nearbyPhoto} /> : <View style={[styles.nearbyPhoto, styles.mystery]}><Text style={styles.mysteryMark}>?</Text></View>}
              <View style={styles.placeCopy}>
                <Text numberOfLines={1} style={styles.nearbyTitle}>{item.place.title}</Text>
                <Text numberOfLines={1} style={styles.meta}>{heading ?? label}</Text>
              </View>
              {seen && <Ionicons name="flag" size={16} color={colors.green} />}
            </Pressable>;
          })}
        </ScrollView>
      </View>}
    </View>
  </View>;
}

const floating = { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, boxShadow: '0px 3px 12px #00000035' };
const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: 0, backgroundColor: colors.soft },
  map: { flex: 1 },
  top: { position: 'absolute', top: 16, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between' },
  progress: { ...floating, minHeight: 48, paddingHorizontal: 14, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 6 },
  progressText: { color: colors.ink, fontWeight: '700', fontSize: 14, lineHeight: 20, fontVariant: ['tabular-nums'] },
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
  placeCopy: { flex: 1, minWidth: 0, gap: 2 },
  placeTitle: { color: colors.ink, fontWeight: '600', fontSize: 17, lineHeight: 23 },
  meta: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  nearbyHeading: { alignSelf: 'flex-start', marginBottom: 8, color: colors.ink, fontSize: 12, lineHeight: 16, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.surface },
  nearbyList: { gap: 10, paddingRight: 16 },
  nearbyCard: { ...floating, width: 228, minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, paddingRight: 12, borderRadius: 16 },
  nearbyPhoto: { width: 46, height: 46, borderRadius: 10 },
  mystery: { backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' },
  mysteryMark: { color: colors.green, fontSize: 22, lineHeight: 26, fontWeight: '800' },
  nearbyTitle: { color: colors.ink, fontWeight: '600', fontSize: 14, lineHeight: 19 },
  newPoint: { ...floating, padding: 18, paddingTop: 6, borderRadius: 20, gap: 12 },
  promptHeading: { flexDirection: 'row', alignItems: 'center' },
  actions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  hint: { ...floating, alignItems: 'center', alignSelf: 'center', maxWidth: '100%', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16 },
  hintText: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  pressed: { opacity: 0.7 },
});
