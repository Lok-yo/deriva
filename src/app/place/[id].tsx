import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { isPreviewPlace } from '../../data/preview';
import { ARRIVAL_RADIUS_M } from '../../domain/exploration';
import { cardinalDirection, distanceMeters, formatDistance, nextDiscovery } from '../../domain/geo';
import type { Place, Position } from '../../domain/models';
import { fetchPlace } from '../../services/places';
import { getCurrentPosition } from '../../services/sensors';
import { useApp } from '../../state/AppProvider';
import { Button } from '../../ui/Button';
import { CompassPanel } from '../../ui/CompassPanel';
import { ConfirmDelete } from '../../ui/ConfirmDelete';
import { ArrivalBanner, ExplorationMeter } from '../../ui/Exploration';
import { EmptyState, Notice, errorMessage } from '../../ui/Feedback';
import { Page } from '../../ui/Page';
import { PlacePhoto } from '../../ui/PlacePhoto';
import { colors, layout, type } from '../../ui/theme';
import { useArrival } from '../../ui/useArrival';

export default function PlaceDetail() {
  const { id, published } = useLocalSearchParams<{ id: string; published?: string }>();
  const app = useApp();
  const knownPlace = app.places.find(p => p.id === id);
  const userId = app.session?.user.id;
  const [loaded, setLoaded] = useState<{ id: string; userId: string; place: Place | null } | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'delete' | 'visit' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [retry, setRetry] = useState(0);
  const [reading, setReading] = useState<Position | null>(null);
  const hasLoaded = loaded?.id === id && loaded?.userId === app.session?.user.id;
  const place = knownPlace ?? (hasLoaded ? loaded?.place : null);
  const example = !!place && isPreviewPlace(place);
  const missing = !knownPlace && !hasLoaded;
  const own = !!place && !!app.session && place.owner_id === app.session.user.id;
  const visit = place ? app.visits.find(item => item.place_key === place.id) : undefined;
  const explored = useMemo(() => new Set([...app.visitedIds, ...app.places.filter(item => item.owner_id === userId).map(item => item.id)]), [app.visitedIds, app.places, userId]);
  const next = place ? nextDiscovery(app.places, place, explored, place.id) : null;
  const target = useMemo(() => place ? [place] : [], [place]);
  const { arrival, announce, dismiss } = useArrival(reading, target);
  useEffect(() => {
    if (knownPlace || !userId || !id) return;
    let cancelled = false;
    void fetchPlace(id).then(result => { if (!cancelled) { setLoaded({ id, userId, place: result }); setFetchError(null); } }).catch(e => { if (!cancelled) { setFetchError(errorMessage(e)); setLoaded({ id, userId, place: null }); } });
    return () => { cancelled = true; };
  }, [id, knownPlace, userId, retry]);

  async function remove() {
    setBusy('delete'); setError(null);
    try { await app.deletePlace(id); router.replace('/'); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(null); }
  }
  async function checkIn() {
    if (!place) return;
    setBusy('visit'); setError(null);
    try {
      const gps = await getCurrentPosition();
      const distance = distanceMeters(gps, place);
      if (distance > ARRIVAL_RADIUS_M) throw new Error(`Todavía estás a ${formatDistance(distance)}. Acércate a menos de ${ARRIVAL_RADIUS_M} m para registrar la visita.`);
      const result = await app.recordVisit(place.id, gps);
      if (result.recorded) announce({ place, result });
      setReading(gps);
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(null); }
  }
  async function retryPhoto() {
    setError(null);
    if (example) return;
    if (knownPlace) { await app.refresh(); return; }
    if (!userId) return;
    try { const result = await fetchPlace(id); setLoaded({ id, userId, place: result }); setFetchError(null); }
    catch (e) { setError(errorMessage(e)); throw e; }
  }

  return <Page>
    <Button label="Volver al mapa" icon="arrow-back-outline" variant="ghost" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} style={{ alignSelf: 'flex-start', paddingLeft: 0 }} />
    {published === '1' && <Notice tone="success">Tu lugar ya está publicado. Alguien puede descubrirlo en el mapa.</Notice>}
    {error && <Notice tone="error">{error}</Notice>}
    {arrival && <ArrivalBanner arrival={arrival} onDismiss={dismiss} />}
    {place ? <>
      <CompassPanel key={id} destination={place} onPosition={setReading} />
      <View style={styles.place}>
        <Text accessibilityRole="header" style={type.title}>{place.title}</Text>
        <PlacePhoto uri={place.photoUrl} label={`Foto de ${place.title}`} style={styles.photoWrap} onRetry={retryPhoto} />
      </View>
      <View style={[layout.card, styles.visit]} testID="visit-card">
        {visit ? <View style={layout.row}>
          <Ionicons name="flag" size={22} color={colors.green} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={type.label}>Visitaste este lugar</Text>
            <Text style={type.small}>{new Date(visit.visited_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}</Text>
          </View>
        </View> : own ? <View style={layout.row}>
          <Ionicons name="person-circle-outline" size={22} color={colors.green} />
          <Text style={[type.small, { flex: 1 }]}>Es tu publicación. Las visitas solo cuentan en lugares de otras personas.</Text>
        </View> : !app.session ? <>
          <Text style={type.label}>Llega hasta aquí para contar tu visita</Text>
          <Text style={type.small}>Inicia sesión para guardar tus visitas. Con {app.requiredVisits} desbloqueas las ubicaciones de pago en cualquier punto.</Text>
          <Button label="Iniciar sesión" icon="person-outline" variant="secondary" onPress={() => router.push('/auth')} />
        </> : <>
          <Text style={type.label}>Llega hasta aquí para contar tu visita</Text>
          <Text style={type.small}>Se registra sola cuando la brújula te ubica a menos de {ARRIVAL_RADIUS_M} m. {app.remoteUnlocked ? `Llevas ${app.visitCount} lugares visitados.` : `Llevas ${app.visitCount}/${app.requiredVisits} para desbloquear las ubicaciones de pago.`}</Text>
          {!app.remoteUnlocked && <ExplorationMeter visits={app.visitCount} required={app.requiredVisits} />}
          <Button label="Ya llegué" icon="flag-outline" variant="secondary" onPress={() => void checkIn()} loading={busy === 'visit'} disabled={!!busy} />
        </>}
      </View>
      {next ? <Pressable accessibilityRole="button" accessibilityLabel={`Siguiente hallazgo: ${next.place.title}, a ${formatDistance(next.distance!)} al ${cardinalDirection(next.bearing!)} de aquí`} onPress={() => router.replace({ pathname: '/place/[id]', params: { id: next.place.id } })} style={({ pressed }) => [layout.card, styles.next, pressed && { opacity: 0.7 }]}>
        <View style={styles.mystery}><Text style={styles.mysteryMark}>?</Text></View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={type.eyebrow}>SIGUIENTE HALLAZGO</Text>
          <Text numberOfLines={2} style={type.label}>{next.place.title}</Text>
          <Text style={type.small}>{formatDistance(next.distance!)} al {cardinalDirection(next.bearing!)} de aquí</Text>
        </View>
        <Ionicons name="arrow-forward" size={21} color={colors.green} />
      </Pressable> : <View style={[layout.card, styles.next]}>
        <Ionicons name="trophy-outline" size={24} color={colors.green} />
        <Text style={[type.small, { flex: 1 }]}>Ya visitaste todos los lugares del mapa. Deja tu propio ? para que alguien más lo encuentre.</Text>
      </View>}
      {own && !example && (confirmDelete ? <ConfirmDelete title={place.title} busy={busy === 'delete'} onCancel={() => setConfirmDelete(false)} onConfirm={() => void remove()} /> : <Button label="Eliminar mi publicación" icon="trash-outline" variant="ghost" style={{ alignSelf: 'flex-start' }} onPress={() => setConfirmDelete(true)} />)}
    </> : missing && app.session ? <View style={{ padding: 48, alignItems: 'center', gap: 16 }}><ActivityIndicator color={colors.green} /><Text style={type.small}>Buscando este lugar…</Text></View> : <EmptyState title={fetchError ? 'No pudimos abrir este camino.' : app.isPreview ? 'Inicia sesión para encontrar este lugar.' : 'Este lugar ya no está en el mapa.'} body={fetchError ?? (app.isPreview ? 'Los enlaces de la comunidad necesitan una cuenta. Mientras tanto puedes explorar los ejemplos.' : 'Puede que su autor lo haya eliminado. Hay más hallazgos esperando en Explorar.')} action={fetchError ? 'Intentar de nuevo' : app.isPreview ? 'Iniciar sesión' : 'Volver a explorar'} onAction={() => fetchError ? setRetry(value => value + 1) : router.replace(app.isPreview ? '/auth' : '/')} />}
  </Page>;
}

const styles = StyleSheet.create({
  place: { gap: 16 },
  photoWrap: { aspectRatio: 1, borderRadius: 18, overflow: 'hidden' },
  visit: { gap: 12, padding: 18 },
  next: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  mystery: { width: 52, height: 52, borderRadius: 12, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' },
  mysteryMark: { color: colors.green, fontSize: 24, lineHeight: 28, fontWeight: '800' },
});
