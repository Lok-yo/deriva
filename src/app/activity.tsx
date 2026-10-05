import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { AppNotification } from '../domain/models';
import { useApp } from '../state/AppProvider';
import { Button } from '../ui/Button';
import { Badge, EmptyState, Notice, errorMessage } from '../ui/Feedback';
import { Page, PageHeading } from '../ui/Page';
import { colors, layout, type } from '../ui/theme';

export default function Activity() {
  const app = useApp();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const unread = app.notifications.filter(n => !n.read_at);
  async function open(notification: AppNotification) {
    setError(null);
    try {
      if (!notification.read_at) await app.markNotificationRead(notification.id);
      if (notification.place_id) router.push({ pathname: '/place/[id]', params: { id: notification.place_id } });
    } catch (e) { setError(errorMessage(e)); }
  }
  async function readAll() {
    setBusy(true); setError(null);
    try { await Promise.all(unread.map(n => app.markNotificationRead(n.id))); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  }
  return <Page>
    <Button label="Volver al perfil" icon="arrow-back-outline" variant="ghost" style={{ alignSelf: 'flex-start', paddingLeft: 0 }} onPress={() => router.canGoBack() ? router.back() : router.replace('/profile')} />
    <PageHeading title="Actividad" action={unread.length > 0 ? <Button label="Marcar todo como leído" icon="checkmark-done-outline" variant="secondary" onPress={() => void readAll()} loading={busy} /> : undefined} />
    {error && <Notice tone="error">{error}</Notice>}
    {!app.session || app.isPreview ? <EmptyState title="Que el próximo hallazgo te encuentre." body="Crea una cuenta y activa tus alertas para enterarte de los nuevos lugares de la comunidad." icon="notifications-outline" action="Crear cuenta o iniciar sesión" onAction={() => router.push('/auth')} /> : <>
      {!app.notificationsEnabled && <View style={layout.card}><Text style={type.label}>Elige qué tan cerca quieres descubrir.</Text><Text style={type.small}>Activa las alertas desde tu perfil. Te pediremos permiso para enviarlas a tu teléfono.</Text><Button label="Configurar mis alertas" icon="options-outline" variant="secondary" onPress={() => router.navigate('/profile')} /></View>}
      {app.notifications.length ? <View>{app.notifications.map(notification => <Pressable key={notification.id} accessibilityRole="button" accessibilityLabel={`${notification.read_at ? 'Leída' : 'Sin leer'}: ${notification.title}. ${notification.body}`} onPress={() => void open(notification)} style={({ pressed }) => [styles.notification, !notification.read_at && styles.newNotification, pressed && { opacity: 0.7 }]}>
        <View style={styles.icon}><Ionicons name="location-outline" size={23} color={colors.green} /></View>
        <View style={{ flex: 1, gap: 7 }}><View style={[layout.row, { justifyContent: 'space-between', flexWrap: 'wrap' }]}><Text accessibilityRole="header" style={[type.label, { flexShrink: 1 }]}>{notification.title}</Text>{!notification.read_at && <Badge text="NUEVA" />}</View><Text style={type.small}>{notification.body}</Text><Text style={[type.small, { fontSize: 11 }]}>{new Date(notification.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text></View>
        {notification.place_id && <Ionicons name="chevron-forward" size={18} color={colors.muted} />}
      </Pressable>)}</View> : <EmptyState title="Por ahora, el camino está tranquilo." body={app.isAdmin ? "Cada lugar nuevo aparecerá aquí, incluidos los tuyos y los que estén lejos." : "Cuando alguien comparta un lugar cerca de tu zona de alertas, aparecerá aquí."} icon="notifications-outline" />}
    </>}
  </Page>;
}

const styles = StyleSheet.create({
  notification: { flexDirection: 'row', gap: 16, padding: 20, alignItems: 'center', borderBottomWidth: 1, borderColor: colors.border },
  newNotification: { backgroundColor: colors.surface },
  icon: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' },
});
