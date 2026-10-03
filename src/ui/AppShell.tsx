import Ionicons from '@expo/vector-icons/Ionicons';
import { router, usePathname } from 'expo-router';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../state/AppProvider';
import { IconButton, type IconName } from './Button';
import { Badge, Notice } from './Feedback';
import { colors, serif, type } from './theme';

const destinations: { path: '/' | '/publish' | '/saved' | '/activity' | '/profile'; title: string; icon: IconName }[] = [
  { path: '/', title: 'Explorar', icon: 'compass-outline' },
  { path: '/publish', title: 'Publicar', icon: 'add-circle-outline' },
  { path: '/saved', title: 'Guardados', icon: 'bookmark-outline' },
  { path: '/activity', title: 'Actividad', icon: 'notifications-outline' },
  { path: '/profile', title: 'Perfil', icon: 'person-outline' },
];

export function Brand({ small = false }: { small?: boolean }) {
  return <View style={styles.brand}><Ionicons name="compass" size={small ? 25 : 32} color={colors.ink} /><Text style={[styles.wordmark, small && { fontSize: 30 }]}>deriva.</Text></View>;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const desktop = width >= 768;
  const compact = desktop && width < 1100;
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const app = useApp();
  const unread = app.notifications.filter(n => !n.read_at).length;
  const activePath = pathname.startsWith('/place/') ? '/' : pathname === '/auth' || pathname === '/premium' ? '/profile' : pathname;
  const status = app.isPreview ? 'Vista previa' : app.connection === 'live' ? 'En vivo' : app.connection === 'connecting' ? 'Conectando' : 'Sin conexión';

  function nav(item: typeof destinations[number], mobile = false) {
    const active = item.path === activePath;
    return (
      <Pressable key={item.path} accessibilityRole="tab" accessibilityLabel={item.title + (item.path === '/activity' && unread ? `, ${unread} sin leer` : '')} accessibilityState={{ selected: active }} onPress={() => router.navigate(item.path)} style={({ pressed }) => [mobile ? styles.mobileItem : styles.navItem, !mobile && compact && styles.compactNav, active && (mobile ? styles.mobileActive : styles.navActive), pressed && { opacity: 0.65 }]}>
        <View>
          <Ionicons name={item.icon} size={mobile ? 23 : 21} color={active ? colors.ink : colors.muted} />
          {item.path === '/activity' && unread > 0 && <View style={styles.unread} />}
        </View>
        {(mobile || !compact) && <Text style={[mobile ? styles.mobileLabel : styles.navLabel, active && { color: colors.ink, fontWeight: '600' }]}>{item.title}</Text>}
        {!mobile && !compact && active && <Ionicons name="arrow-forward" color={colors.ink} size={16} style={{ marginLeft: 'auto' }} />}
      </Pressable>
    );
  }

  return (
    <View style={[styles.shell, { paddingTop: insets.top }]}>
      {desktop && <View style={[styles.sidebar, compact && styles.compactSidebar]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Deriva, ir a Explorar" onPress={() => router.navigate('/')} style={compact && { minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>{compact ? <Ionicons name="compass" size={32} color={colors.ink} /> : <Brand />}</Pressable>
        {!compact && <Text style={[type.eyebrow, { marginTop: 8, marginBottom: 36, letterSpacing: 1.5 }]}>ENCUENTRA LO INESPERADO</Text>}
        <View accessibilityRole="tablist" style={[{ gap: 6 }, compact && { marginTop: 28 }]}>{destinations.map(item => nav(item))}</View>
        <View style={{ flex: 1 }} />
        {compact ? <IconButton icon="sparkles-outline" label="Conocer Deriva Premium" onPress={() => router.push('/premium')} active /> : <Pressable accessibilityRole="button" accessibilityLabel="Conocer Deriva Premium" onPress={() => router.push('/premium')} style={styles.premium}>
          <Ionicons name="sparkles-outline" size={22} color={colors.lime} />
          <Text style={styles.premiumTitle}>{app.premium ? 'Tu aventura, sin límites.' : 'Un poco más allá.'}</Text>
          <Text style={styles.premiumText}>{app.premium ? 'Gestiona tu plan Premium.' : 'Elige el punto. Comparte tu mirada.'}</Text>
          <View style={styles.premiumLink}><Text style={{ color: colors.lime, fontSize: 12, fontWeight: '600' }}>Deriva Premium</Text><Ionicons name="arrow-forward" size={16} color={colors.lime} /></View>
        </Pressable>}
        {!compact && <Text style={[type.small, { marginTop: 20, fontSize: 11 }]}>El mundo, a tu ritmo.</Text>}
      </View>}
      <View style={styles.main}>
        <View style={[styles.header, !desktop && styles.mobileHeader]}>
          {desktop ? <Text style={type.eyebrow}>TU PRÓXIMA AVENTURA</Text> : <Pressable accessibilityRole="button" accessibilityLabel="Deriva, ir a Explorar" onPress={() => router.navigate('/')}><Brand small /></Pressable>}
          <View style={styles.headerRight}>
            {app.isPreview ? <Badge text={status} /> : <View style={styles.connection}><View style={[styles.dot, app.connection !== 'live' && { backgroundColor: colors.muted }]} /><Text style={type.small}>{status}</Text></View>}
            <IconButton icon="person-outline" label={app.session ? 'Abrir mi perfil' : 'Crear cuenta o iniciar sesión'} onPress={() => router.navigate(app.session ? '/profile' : '/auth')} />
          </View>
        </View>
        {app.error && !app.isPreview && <View style={styles.globalError}><Notice tone="error">{app.error}</Notice></View>}
        <View style={styles.route}>{children}</View>
        {!desktop && <View accessibilityRole="tablist" style={[styles.mobileNav, { paddingBottom: Math.max(insets.bottom, 8) }]}>{destinations.map(item => nav(item, true))}</View>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, flexDirection: 'row', backgroundColor: colors.background },
  sidebar: { width: 232, padding: 24, paddingTop: 28, borderRightWidth: 1, borderColor: colors.border },
  compactSidebar: { width: 80, padding: 12, paddingTop: 20, alignItems: 'center' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  wordmark: { fontFamily: serif, fontWeight: '600', fontSize: 38, letterSpacing: -1.5, color: colors.ink },
  navItem: { minHeight: 52, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 12 },
  navActive: { backgroundColor: colors.lime },
  compactNav: { width: 52, paddingHorizontal: 0, justifyContent: 'center' },
  navLabel: { color: colors.muted, fontSize: 14, lineHeight: 22 },
  premium: { backgroundColor: colors.ink, borderRadius: 12, padding: 20, gap: 10 },
  premiumTitle: { color: colors.surface, fontFamily: serif, fontSize: 23, lineHeight: 28 },
  premiumText: { color: '#CDDACC', fontSize: 12, lineHeight: 19 },
  premiumLink: { marginTop: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  main: { flex: 1, minWidth: 0 },
  header: { minHeight: 72, paddingHorizontal: 32, paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderColor: colors.border, gap: 12 },
  mobileHeader: { minHeight: 66, paddingHorizontal: 20, paddingVertical: 8 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  connection: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 6, height: 6, backgroundColor: colors.green, borderRadius: 3 },
  route: { flex: 1, minHeight: 0 },
  globalError: { paddingHorizontal: 24, paddingTop: 12 },
  mobileNav: { paddingTop: 8, paddingHorizontal: 4, flexDirection: 'row', backgroundColor: colors.surface, borderTopWidth: 1, borderColor: colors.border },
  mobileItem: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 5, borderRadius: 8 },
  mobileActive: { backgroundColor: colors.soft },
  mobileLabel: { color: colors.muted, fontSize: 10, lineHeight: 15 },
  unread: { position: 'absolute', top: 0, right: -2, width: 7, height: 7, borderRadius: 4, backgroundColor: colors.green, borderWidth: 1, borderColor: colors.surface },
});
