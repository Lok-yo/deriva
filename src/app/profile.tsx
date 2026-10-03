import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useApp } from '../state/AppProvider';
import { Button } from '../ui/Button';
import { Badge, EmptyState, Notice, errorMessage } from '../ui/Feedback';
import { NotificationPreferences } from '../ui/NotificationPreferences';
import { Page, PageHeading } from '../ui/Page';
import { PlaceRow } from '../ui/PlaceRow';
import { ProfileEditor } from '../ui/ProfileEditor';
import { SensorGuide } from '../ui/SensorGuide';
import { colors, layout, serif, type } from '../ui/theme';

export default function Profile() {
  const app = useApp();
  const { width } = useWindowDimensions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const ownPlaces = app.places.filter(p => p.owner_id === app.session?.user.id);
  const name = app.profile?.display_name ?? '';
  async function signOut() {
    setBusy(true); setError(null);
    try { await app.signOut(); router.replace('/'); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  }
  return <Page keyboard>
    <PageHeading eyebrow="Tu forma de explorar" title={app.session ? 'Un camino muy tuyo.' : 'Cada aventura empieza contigo.'} />
    {error && <Notice tone="error">{error}</Notice>}
    {message && <Notice tone="success">{message}</Notice>}
    {!app.session || app.isPreview ? <>
      <EmptyState title="Encuentra tu lugar en Deriva." body="Crea una cuenta gratuita para compartir lugares, guardar tus favoritos y recibir alertas cerca de ti." icon="person-outline" action="Crear cuenta o iniciar sesión" onAction={() => router.push('/auth')} />
      <View style={layout.card}><Text accessibilityRole="header" style={type.heading}>Gratis para empezar. Premium para ir más allá.</Text><Text style={type.small}>Comparte una foto tomada ahora desde tu ubicación. Con Premium, elige cualquier punto y usa fotos de tu galería.</Text><Button label="Conocer Premium" icon="sparkles-outline" variant="secondary" onPress={() => router.push('/premium')} style={{ alignSelf: 'flex-start' }} /></View>
      <SensorGuide />
    </> : <>
      <View style={[layout.row, { flexWrap: 'wrap', gap: 20 }]}><View style={styles.avatar}><Text style={styles.initial}>{(name || app.session.user.email || 'D').slice(0, 1).toUpperCase()}</Text></View><View style={{ flex: 1, gap: 6 }}><Text accessibilityRole="header" style={type.heading}>{name || 'Explorador'}</Text><Text selectable style={type.small}>{app.session.user.email}</Text><Badge text={app.premium ? 'PREMIUM ACTIVO' : 'PLAN GRATUITO'} /></View><Button label={app.premium ? 'Gestionar Premium' : 'Descubrir Premium'} icon="sparkles-outline" variant="secondary" onPress={() => router.push('/premium')} /></View>
      <View style={[layout.section, width >= 1100 && { flexDirection: 'row', alignItems: 'flex-start', gap: 24 }]}><View style={{ flex: 1 }}><ProfileEditor key={name} name={name} onSaved={() => setMessage('Tu nombre se actualizó.')} /></View><View style={{ flex: 1 }}><NotificationPreferences key={`${app.notificationsEnabled}:${app.notificationRadius}`} initialEnabled={app.notificationsEnabled} initialRadius={app.notificationRadius} onSaved={setMessage} /></View></View>
      <View style={layout.section}><View style={[layout.row, { justifyContent: 'space-between', flexWrap: 'wrap' }]}><Text accessibilityRole="header" style={type.heading}>Tus hallazgos en el mapa</Text><Button label="Publicar uno nuevo" icon="add-outline" variant="ghost" onPress={() => router.navigate('/publish')} /></View>{ownPlaces.length ? ownPlaces.map(place => <PlaceRow key={place.id} place={place} saved={app.savedIds.includes(place.id)} onSave={() => { void app.toggleSaved(place.id).catch(e => setError(errorMessage(e))); }} onOpen={() => router.push({ pathname: '/place/[id]', params: { id: place.id } })} onRetryPhoto={app.refresh} />) : <EmptyState title="Tu primera historia está por escribirse." body="Comparte ese rincón que merece encontrarse." icon="location-outline" action="Publicar un lugar" onAction={() => router.navigate('/publish')} />}</View>
      <View style={layout.line} /><View style={[layout.row, { justifyContent: 'space-between', flexWrap: 'wrap' }]}><View style={[layout.row, { flex: 1 }]}><Ionicons name="shield-checkmark-outline" color={colors.green} size={20} /><Text style={[type.small, { flex: 1 }]}>Tus datos biométricos permanecen en tu teléfono.</Text></View><Button label="Cerrar sesión" icon="log-out-outline" variant="ghost" onPress={() => void signOut()} loading={busy} /></View>
    </>}
  </Page>;
}

const styles = StyleSheet.create({
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' },
  initial: { fontFamily: serif, fontSize: 36, color: colors.ink },
});
