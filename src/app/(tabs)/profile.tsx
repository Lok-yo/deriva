import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../../state/AppProvider';
import { Button, type IconName } from '../../ui/Button';
import { Notice, errorMessage } from '../../ui/Feedback';
import { NotificationPreferences } from '../../ui/NotificationPreferences';
import { Page, PageHeading } from '../../ui/Page';
import { PlaceRow } from '../../ui/PlaceRow';
import { ProfileEditor } from '../../ui/ProfileEditor';
import { colors, layout, type } from '../../ui/theme';

function MenuRow({ title, detail, icon, onPress, expanded }: { title: string; detail?: string; icon: IconName; onPress: () => void; expanded?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={expanded == null ? undefined : { expanded }} onPress={onPress} style={({ pressed }) => [styles.menuRow, pressed && { opacity: 0.65 }]}>
    <Ionicons name={icon} size={21} color={colors.green} />
    <Text style={styles.menuTitle}>{title}</Text>
    {detail && <Text style={type.small}>{detail}</Text>}
    <Ionicons name={expanded ? 'chevron-down' : 'chevron-forward'} size={18} color={colors.muted} />
  </Pressable>;
}

export default function Profile() {
  const app = useApp();
  const [section, setSection] = useState<'name' | 'alerts' | 'places' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const ownPlaces = app.places.filter(place => place.owner_id === app.session?.user.id);
  const name = app.profile?.display_name ?? 'Explorador';
  const unread = app.notifications.filter(notification => !notification.read_at).length;
  const toggle = (next: typeof section) => setSection(current => current === next ? null : next);
  async function signOut() {
    setBusy(true); setError(null);
    try { await app.signOut(); router.replace('/'); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  }
  return <Page keyboard>
    <PageHeading title="Perfil" />
    {error && <Notice tone="error">{error}</Notice>}
    {message && <Notice tone="success">{message}</Notice>}
    {app.session ? <View style={[layout.row, { gap: 16 }]}>
      <View style={styles.avatar}><Text style={styles.initial}>{name.slice(0, 1).toUpperCase()}</Text></View>
      <View style={{ flex: 1, gap: 3 }}><Text style={type.heading}>{name}</Text><Text selectable style={type.small}>{app.session.user.email}</Text><Text style={type.small}>{app.isAdmin ? 'Administrador' : 'Cuenta personal'}</Text></View>
    </View> : <View style={{ gap: 12 }}>
      <Text style={type.body}>Comparte lugares y encuentra nuevos destinos.</Text>
      <Button label="Crear cuenta o iniciar sesión" icon="person-outline" onPress={() => router.push('/auth')} />
    </View>}
    <View style={styles.menu}>
      <MenuRow title="Actividad" detail={unread ? `${unread} sin leer` : undefined} icon="notifications-outline" onPress={() => router.push('/activity')} />
    </View>
    {app.session && <>
      <View style={styles.menu}>
        <MenuRow title="Editar nombre" icon="person-outline" expanded={section === 'name'} onPress={() => toggle('name')} />
        {section === 'name' && <View style={styles.expanded}><ProfileEditor key={name} name={name} onSaved={() => setMessage('Tu nombre se actualizó.')} /></View>}
        <MenuRow title={app.isAdmin ? "Alertas de administrador" : "Alertas de lugares cercanos"} icon="options-outline" expanded={section === 'alerts'} onPress={() => toggle('alerts')} />
        {section === 'alerts' && <View style={styles.expanded}>{app.isAdmin ? <View style={layout.card}><Text style={type.heading}>Todos los nuevos lugares</Text><Text style={type.small}>Recibes avisos sin límite de distancia, incluidos tus propios lugares. Permite las notificaciones en los ajustes de tu teléfono para recibirlas.</Text><Text style={type.small}>En Expo Go, los avisos aparecen en Actividad; el push remoto requiere una versión propia de Deriva.</Text></View> : <NotificationPreferences key={`${app.notificationsEnabled}:${app.notificationRadius}`} initialEnabled={app.notificationsEnabled} initialRadius={app.notificationRadius} onSaved={setMessage} />}</View>}
        <MenuRow title="Mis publicaciones" detail={String(ownPlaces.length)} icon="location-outline" expanded={section === 'places'} onPress={() => toggle('places')} />
        {section === 'places' && <View style={styles.expanded}>
          {ownPlaces.length ? ownPlaces.map(place => <PlaceRow key={place.id} place={place} saved={app.savedIds.includes(place.id)} onSave={() => { void app.toggleSaved(place.id).catch(e => setError(errorMessage(e))); }} onOpen={() => router.push({ pathname: '/place/[id]', params: { id: place.id } })} onRetryPhoto={app.refresh} />) : <Text style={type.small}>Aún no has publicado. Puedes compartir un lugar desde Publicar.</Text>}
        </View>}
      </View>
      <Button label="Cerrar sesión" icon="log-out-outline" variant="ghost" onPress={() => void signOut()} loading={busy} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
    </>}
    {app.error && <Notice tone="error">{app.error}</Notice>}
    {app.session && <Text style={type.small}>{app.connection === 'live' ? 'Sincronización en tiempo real activa' : app.connection === 'offline' ? 'Sin conexión. Volveremos a sincronizar al recuperar internet.' : 'Conectando con tus lugares…'}</Text>}
  </Page>;
}

const styles = StyleSheet.create({
  avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' },
  initial: { fontSize: 26, fontWeight: '600', color: colors.green },
  menu: { borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  menuRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  menuTitle: { flex: 1, color: colors.ink, fontSize: 15, lineHeight: 22 },
  expanded: { paddingTop: 8, paddingBottom: 18 },
});
