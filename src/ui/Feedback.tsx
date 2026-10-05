import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';
import { Button, type IconName } from './Button';
import { colors, type } from './theme';

export function Notice({ children, tone = 'info' }: { children: string; tone?: 'info' | 'error' | 'success' }) {
  const error = tone === 'error';
  return (
    <View accessibilityRole={error ? 'alert' : undefined} accessibilityLiveRegion="polite" style={[styles.notice, error && styles.error]}>
      <Ionicons name={error ? 'alert-circle-outline' : tone === 'success' ? 'checkmark-circle-outline' : 'information-circle-outline'} size={19} color={error ? colors.error : colors.green} />
      <Text style={[type.small, styles.noticeText, error && { color: colors.error }]}>{children}</Text>
    </View>
  );
}

export function EmptyState({ title, body, icon = 'compass-outline', action, onAction }: { title: string; body: string; icon?: IconName; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}><Ionicons name={icon} size={28} color={colors.green} /></View>
      <Text accessibilityRole="header" style={[type.heading, { textAlign: 'center' }]}>{title}</Text>
      <Text style={[type.small, { textAlign: 'center', maxWidth: 340 }]}>{body}</Text>
      {action && onAction && <Button label={action} onPress={onAction} variant="secondary" />}
    </View>
  );
}

export function Badge({ text, dark = false }: { text: string; dark?: boolean }) {
  return <View style={[styles.badge, dark && { backgroundColor: colors.background }]}><Text style={styles.badgeText}>{text}</Text></View>;
}

export function LoadingPlaces() {
  return (
    <View accessibilityLabel="Cargando lugares" accessibilityState={{ busy: true }} style={{ gap: 16 }}>
      {[0, 1, 2].map(key => <View key={key} style={styles.loading}><View style={styles.loadingImage} /><View style={{ flex: 1, gap: 12 }}><View style={styles.loadingTitle} /><View style={[styles.loadingTitle, { width: '60%' }]} /></View></View>)}
    </View>
  );
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'No pudimos completar la acción. Intenta de nuevo.';
}

const styles = StyleSheet.create({
  notice: { flexDirection: 'row', gap: 10, padding: 14, backgroundColor: colors.soft, borderRadius: 8, alignItems: 'flex-start' },
  error: { backgroundColor: colors.errorSurface },
  noticeText: { flex: 1 },
  empty: { alignItems: 'center', gap: 12, paddingVertical: 40, paddingHorizontal: 16 },
  emptyIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  badge: { alignSelf: 'flex-start', backgroundColor: colors.soft, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 5 },
  badgeText: { color: colors.green, fontWeight: '600', fontSize: 10, lineHeight: 16, letterSpacing: 0.4 },
  loading: { flexDirection: 'row', gap: 16, paddingVertical: 12 },
  loadingImage: { width: 88, height: 88, borderRadius: 8, backgroundColor: colors.border },
  loadingTitle: { width: '80%', height: 16, backgroundColor: colors.border, borderRadius: 4 },
});
