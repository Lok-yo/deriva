import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { Place } from '../../domain/models';
import { MapView } from '../../maps/MapView';
import { fetchPlace } from '../../services/places';
import { useApp } from '../../state/AppProvider';
import { Button } from '../../ui/Button';
import { CompassPanel } from '../../ui/CompassPanel';
import { ConfirmDelete } from '../../ui/ConfirmDelete';
import { Badge, EmptyState, Notice, errorMessage } from '../../ui/Feedback';
import { Page } from '../../ui/Page';
import { PlacePhoto } from '../../ui/PlacePhoto';
import { categoryLabels } from '../../ui/PlaceRow';
import { colors, layout, type } from '../../ui/theme';

export default function PlaceDetail() {
  const { id, published } = useLocalSearchParams<{ id: string; published?: string }>();
  const app = useApp();
  const { width } = useWindowDimensions();
  const knownPlace = app.places.find(p => p.id === id);
  const userId = app.session?.user.id;
  const [loaded, setLoaded] = useState<{ id: string; userId: string; place: Place | null } | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [retry, setRetry] = useState(0);
  const hasLoaded = loaded?.id === id && loaded?.userId === app.session?.user.id;
  const place = knownPlace ?? (hasLoaded ? loaded?.place : null);
  const missing = !knownPlace && !hasLoaded;
  const saved = app.savedIds.includes(id);
  const own = !!place && !!app.session && place.owner_id === app.session.user.id;
  useEffect(() => {
    if (knownPlace || !userId || !id) return;
    let cancelled = false;
    void fetchPlace(id).then(result => { if (!cancelled) { setLoaded({ id, userId, place: result }); setFetchError(null); } }).catch(e => { if (!cancelled) { setFetchError(errorMessage(e)); setLoaded({ id, userId, place: null }); } });
    return () => { cancelled = true; };
  }, [id, knownPlace, userId, retry]);

  async function save() {
    if (!app.session || app.isPreview) { router.push('/auth'); return; }
    setBusy('save'); setError(null);
    try { await app.toggleSaved(id); } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(null); }
  }
  async function remove() {
    setBusy('delete'); setError(null);
    try { await app.deletePlace(id); router.replace('/'); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(null); }
  }
  async function navigate() {
    if (!place) return;
    try { await Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${place.latitude},${place.longitude}&travelmode=walking`); }
    catch (e) { setError(errorMessage(e)); }
  }
  async function retryPhoto() {
    setError(null);
    if (app.isPreview) return;
    if (knownPlace) { await app.refresh(); return; }
    if (!userId) return;
    try { const result = await fetchPlace(id); setLoaded({ id, userId, place: result }); setFetchError(null); }
    catch (e) { setError(errorMessage(e)); throw e; }
  }

  return <Page>
    <Button label="Volver a explorar" icon="arrow-back-outline" variant="ghost" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} style={{ alignSelf: 'flex-start', paddingLeft: 0 }} />
    {published === '1' && <Notice tone="success">Tu lugar ya está publicado. Alguien puede descubrirlo en el mapa.</Notice>}
    {error && <Notice tone="error">{error}</Notice>}
    {place ? <>
      <View style={[layout.section, width >= 1100 && { flexDirection: 'row', alignItems: 'flex-start', gap: 32 }]}>
        <View style={{ flex: 1, gap: 24 }}>
          <PlacePhoto uri={place.photoUrl} label={`Foto de ${place.title}`} style={styles.photoWrap} onRetry={retryPhoto} overlay={<View pointerEvents="none" style={styles.photoBadge}><Badge text={categoryLabels[place.category].toUpperCase()} dark /></View>} />
          <View style={{ gap: 12 }}><Text style={type.eyebrow}>{app.isPreview ? 'LUGAR DE EJEMPLO' : 'UN HALLAZGO DE LA COMUNIDAD'}</Text><Text accessibilityRole="header" style={type.title}>{place.title}</Text><View style={[layout.row, { flexWrap: 'wrap' }]}><View style={layout.row}><Ionicons name="person-outline" size={15} color={colors.muted} /><Text style={type.small}>{place.authorName}</Text></View><Text style={type.small}>{new Date(place.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}</Text></View></View>
          <View style={layout.wrap}><Button label={saved ? 'Lugar guardado' : 'Guardar lugar'} icon={saved ? 'bookmark' : 'bookmark-outline'} variant={saved ? 'primary' : 'secondary'} onPress={() => void save()} loading={busy === 'save'} disabled={!!busy} /><Button label="Abrir navegación" icon="navigate-outline" variant="secondary" onPress={() => void navigate()} /></View>
          <MapView places={[place]} center={place} selectedId={place.id} style={{ height: 280, flex: 0 }} />
          <Text selectable style={type.small}>{place.latitude.toFixed(6)}, {place.longitude.toFixed(6)}</Text>
        </View>
        <View style={{ flex: 1, gap: 24 }}><CompassPanel key={id} destination={place} preview={app.isPreview} /><Notice>La brújula indica la dirección, no una ruta transitable. Revisa el acceso al lugar y respeta la propiedad privada.</Notice>{own && (confirmDelete ? <ConfirmDelete title={place.title} busy={busy === 'delete'} onCancel={() => setConfirmDelete(false)} onConfirm={() => void remove()} /> : <Button label="Eliminar mi publicación" icon="trash-outline" variant="ghost" style={{ alignSelf: 'flex-start' }} onPress={() => setConfirmDelete(true)} />)}</View>
      </View>
    </> : missing && app.session ? <View style={{ padding: 48, alignItems: 'center', gap: 16 }}><ActivityIndicator color={colors.green} /><Text style={type.small}>Buscando este lugar…</Text></View> : <EmptyState title={fetchError ? 'No pudimos abrir este camino.' : app.isPreview ? 'Inicia sesión para encontrar este lugar.' : 'Este lugar ya no está en el mapa.'} body={fetchError ?? (app.isPreview ? 'Los enlaces de la comunidad necesitan una cuenta. Mientras tanto puedes explorar los ejemplos.' : 'Puede que su autor lo haya eliminado. Hay más hallazgos esperando en Explorar.')} action={fetchError ? 'Intentar de nuevo' : app.isPreview ? 'Iniciar sesión' : 'Volver a explorar'} onAction={() => fetchError ? setRetry(value => value + 1) : router.replace(app.isPreview ? '/auth' : '/')} />}
  </Page>;
}

const styles = StyleSheet.create({
  photoWrap: { height: 320, borderRadius: 12, overflow: 'hidden', position: 'relative' },
  photoBadge: { position: 'absolute', bottom: 18, left: 18 },
});
