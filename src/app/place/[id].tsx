import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { isPreviewPlace } from '../../data/preview';
import type { Place } from '../../domain/models';
import { fetchPlace } from '../../services/places';
import { useApp } from '../../state/AppProvider';
import { Button } from '../../ui/Button';
import { CompassPanel } from '../../ui/CompassPanel';
import { ConfirmDelete } from '../../ui/ConfirmDelete';
import { EmptyState, Notice, errorMessage } from '../../ui/Feedback';
import { Page } from '../../ui/Page';
import { PlacePhoto } from '../../ui/PlacePhoto';
import { colors, type } from '../../ui/theme';

export default function PlaceDetail() {
  const { id, published } = useLocalSearchParams<{ id: string; published?: string }>();
  const app = useApp();
  const knownPlace = app.places.find(p => p.id === id);
  const userId = app.session?.user.id;
  const [loaded, setLoaded] = useState<{ id: string; userId: string; place: Place | null } | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'delete' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [retry, setRetry] = useState(0);
  const hasLoaded = loaded?.id === id && loaded?.userId === app.session?.user.id;
  const place = knownPlace ?? (hasLoaded ? loaded?.place : null);
  const example = !!place && isPreviewPlace(place);
  const missing = !knownPlace && !hasLoaded;
  const own = !!place && !!app.session && place.owner_id === app.session.user.id;
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
    {place ? <>
      <CompassPanel key={id} destination={place} />
      <View style={styles.place}>
        <Text accessibilityRole="header" style={type.title}>{place.title}</Text>
        <PlacePhoto uri={place.photoUrl} label={`Foto de ${place.title}`} style={styles.photoWrap} onRetry={retryPhoto} />
      </View>
      {own && !example && (confirmDelete ? <ConfirmDelete title={place.title} busy={busy === 'delete'} onCancel={() => setConfirmDelete(false)} onConfirm={() => void remove()} /> : <Button label="Eliminar mi publicación" icon="trash-outline" variant="ghost" style={{ alignSelf: 'flex-start' }} onPress={() => setConfirmDelete(true)} />)}
    </> : missing && app.session ? <View style={{ padding: 48, alignItems: 'center', gap: 16 }}><ActivityIndicator color={colors.green} /><Text style={type.small}>Buscando este lugar…</Text></View> : <EmptyState title={fetchError ? 'No pudimos abrir este camino.' : app.isPreview ? 'Inicia sesión para encontrar este lugar.' : 'Este lugar ya no está en el mapa.'} body={fetchError ?? (app.isPreview ? 'Los enlaces de la comunidad necesitan una cuenta. Mientras tanto puedes explorar los ejemplos.' : 'Puede que su autor lo haya eliminado. Hay más hallazgos esperando en Explorar.')} action={fetchError ? 'Intentar de nuevo' : app.isPreview ? 'Iniciar sesión' : 'Volver a explorar'} onAction={() => fetchError ? setRetry(value => value + 1) : router.replace(app.isPreview ? '/auth' : '/')} />}
  </Page>;
}

const styles = StyleSheet.create({
  place: { gap: 16 },
  photoWrap: { aspectRatio: 1, borderRadius: 18, overflow: 'hidden' },
});
