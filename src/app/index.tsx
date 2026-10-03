import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { chooseRandomPlace, distanceMeters } from '../domain/geo';
import type { Category, Position } from '../domain/models';
import { MapView } from '../maps/MapView';
import { getCurrentPosition } from '../services/sensors';
import { useApp } from '../state/AppProvider';
import { Button } from '../ui/Button';
import { ExploreFilters } from '../ui/ExploreFilters';
import { Badge, EmptyState, LoadingPlaces, Notice, errorMessage } from '../ui/Feedback';
import { Page } from '../ui/Page';
import { PlaceRow } from '../ui/PlaceRow';
import { colors, layout, type } from '../ui/theme';

export default function Explore() {
  const app = useApp();
  const { width } = useWindowDimensions();
  const wide = width >= 1100;
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category | null>(null);
  const [radius, setRadius] = useState(5);
  const [position, setPosition] = useState<Position | null>(null);
  const [busy, setBusy] = useState<'gps' | 'random' | 'refresh' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const matching = useMemo(() => app.places.filter(p => (!category || p.category === category) && p.title.toLocaleLowerCase('es').includes(query.trim().toLocaleLowerCase('es'))), [app.places, query, category]);
  const visible = useMemo(() => matching.filter(p => !position || distanceMeters(position, p) <= radius * 1000).sort((a, b) => position ? distanceMeters(position, a) - distanceMeters(position, b) : 0), [matching, position, radius]);
  const open = (id: string) => router.push({ pathname: '/place/[id]', params: { id } });

  async function locate() {
    setBusy('gps'); setError(null);
    try { setPosition(await getCurrentPosition()); } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(null); }
  }
  async function surprise() {
    setBusy('random'); setError(null);
    try {
      const origin = app.isPreview ? null : await getCurrentPosition();
      if (origin) setPosition(origin);
      const place = chooseRandomPlace(matching, origin, radius);
      if (place) open(place.id);
      else setError('No hay lugares con estos filtros dentro del radio elegido. Prueba un radio mayor.');
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(null); }
  }
  async function save(id: string) {
    if (!app.session || app.isPreview) { router.push('/auth'); return; }
    try { await app.toggleSaved(id); } catch (e) { setError(errorMessage(e)); }
  }
  async function refresh() {
    setBusy('refresh'); setError(null);
    try { await app.refresh(); } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(null); }
  }
  const results = <View style={styles.results}>
    <View style={[layout.row, { justifyContent: 'space-between' }]}>
      <Text accessibilityRole="header" style={type.heading}>{position ? 'Cerca de ti' : app.isPreview ? 'Lugares de ejemplo' : 'Por descubrir'}</Text>
      <Text style={type.small}>{visible.length} {visible.length === 1 ? 'lugar' : 'lugares'}</Text>
    </View>
    {app.connection === 'connecting' && !app.places.length ? <LoadingPlaces /> : visible.length === 0 ? <EmptyState title="Todavía hay mucho por descubrir." body="No encontramos lugares con estos filtros. Amplía el radio o comparte el primero." action="Publicar un lugar" onAction={() => router.push('/publish')} /> : visible.map((place, index) => <PlaceRow key={place.id} place={place} index={index} distance={position ? distanceMeters(position, place) : undefined} saved={app.savedIds.includes(place.id)} onOpen={() => open(place.id)} onSave={() => void save(place.id)} onRetryPhoto={app.refresh} />)}
  </View>;
  const map = <View style={[styles.mapSection, wide && { flex: 1, height: '100%' }]}>
    <MapView places={visible} origin={position} center={position} onSelectPlace={open} style={{ flex: 1 }} />
    <View pointerEvents="none" style={styles.mapLabel}><Badge text={app.isPreview ? 'EXPLORA LOS EJEMPLOS' : 'UN PUNTO, UNA HISTORIA'} dark /></View>
    <View style={styles.mapFootnote}><Ionicons name="location-outline" size={13} color={colors.green} /><Text style={[type.small, { fontSize: 11, flex: 1 }]}>{position ? `GPS activo · precisión ±${Math.round(position.accuracy)} m` : 'Activa tu ubicación cuando quieras descubrir lo cercano.'}</Text></View>
  </View>;

  return <Page style={width < 420 ? { padding: 20 } : undefined}>
    <View style={[styles.intro, wide && { flexDirection: 'row', alignItems: 'flex-end' }]}>
      <View style={{ gap: 12, flex: 1 }}>
        <Text style={type.eyebrow}>SAL DE LO DE SIEMPRE</Text>
        <Text accessibilityRole="header" style={[type.display, width < 600 && type.title]}>La próxima historia{wide ? '\n' : ' '}está cerca.</Text>
        <Text style={[type.body, styles.subtitle]}>Rincones compartidos por personas curiosas. Elige uno o deja que el azar marque el rumbo.</Text>
      </View>
      <View style={{ gap: 8, alignSelf: wide ? 'flex-end' : 'flex-start' }}>
        <Button label="Sorpréndeme" icon="shuffle-outline" onPress={() => void surprise()} loading={busy === 'random'} disabled={!!busy || !matching.length} />
        <Text style={[type.small, { fontSize: 11, textAlign: wide ? 'right' : 'left' }]}>{app.isPreview ? 'Una sorpresa entre los ejemplos' : 'El azar elige. Tú decides ir.'}</Text>
      </View>
    </View>
    {error && <Notice tone="error">{error}</Notice>}
    <View style={[styles.board, wide && styles.wideBoard]}>
      {!wide && map}
      <View style={[styles.panel, wide && styles.widePanel]}>
        <ExploreFilters query={query} setQuery={setQuery} category={category} setCategory={setCategory} radius={radius} setRadius={setRadius} hasPosition={!!position} />
        <View style={layout.wrap}>
          <Button label={position ? 'Actualizar GPS' : 'Usar mi ubicación'} icon="locate-outline" variant="secondary" onPress={() => void locate()} loading={busy === 'gps'} disabled={!!busy} />
          {!app.isPreview && <Button label="Actualizar" icon="refresh-outline" variant="ghost" onPress={() => void refresh()} loading={busy === 'refresh'} disabled={!!busy} />}
        </View>
        {wide && <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 8 }}>{results}</ScrollView>}
      </View>
      {wide && map}
    </View>
    {!wide && results}
    {app.isPreview && <View style={styles.previewFooter}><Text style={[type.small, { flex: 1 }]}>Estás viendo lugares de ejemplo. Crea tu cuenta para descubrir y compartir con la comunidad.</Text><Button label="Unirme a Deriva" variant="secondary" icon="arrow-forward-outline" onPress={() => router.push('/auth')} /></View>}
  </Page>;
}

const styles = StyleSheet.create({
  intro: { gap: 20 },
  subtitle: { color: colors.muted, maxWidth: 460 },
  board: { gap: 24 },
  wideBoard: { flexDirection: 'row', height: 620, gap: 28 },
  panel: { gap: 16 },
  widePanel: { width: 348 },
  mapSection: { height: 360, position: 'relative' },
  mapLabel: { position: 'absolute', top: 18, left: 18 },
  mapFootnote: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingTop: 10 },
  results: { gap: 4 },
  previewFooter: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 16, borderTopWidth: 1, borderColor: colors.border, paddingTop: 20 },
});
