import Ionicons from '@expo/vector-icons/Ionicons';
import { router, usePathname } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../state/AppProvider';
import type { IconName } from './Button';
import { colors } from './theme';

const destinations: { path: '/' | '/publish' | '/profile'; title: string; icon: IconName; activeIcon: IconName }[] = [
  { path: '/', title: 'Mapa', icon: 'map-outline', activeIcon: 'map' },
  { path: '/publish', title: 'Publicar', icon: 'add-circle-outline', activeIcon: 'add-circle' },
  { path: '/profile', title: 'Perfil', icon: 'person-outline', activeIcon: 'person' },
];

export function Brand({ small = false }: { small?: boolean }) {
  return <View style={styles.brand}><Ionicons name="compass-outline" size={small ? 21 : 25} color={colors.ink} /><Text style={[styles.wordmark, small && { fontSize: 19 }]}>Deriva</Text></View>;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const app = useApp();
  const unread = app.notifications.filter(notification => !notification.read_at).length;
  const activePath = pathname.startsWith('/place/') ? '/' : pathname === '/publish' ? '/publish' : pathname === '/' ? '/' : '/profile';
  return <View style={[styles.shell, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>
    <View style={styles.route}>{children}</View>
    <View accessibilityRole="tablist" style={[styles.navigation, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {destinations.map(item => {
        const active = activePath === item.path;
        return <Pressable
          key={item.path}
          accessibilityRole="tab"
          accessibilityLabel={item.title}
          accessibilityState={{ selected: active }}
          onPress={() => router.navigate(item.path)}
          style={({ pressed }) => [styles.item, pressed && { opacity: 0.6 }]}
        >
          <View style={[styles.icon, active && styles.active]}>
            <Ionicons name={active ? item.activeIcon : item.icon} size={23} color={active ? colors.green : colors.muted} />
            {item.path === '/profile' && unread > 0 && <View style={styles.unread} />}
          </View>
          <Text style={[styles.label, active && styles.activeLabel]}>{item.title}</Text>
        </Pressable>;
      })}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: colors.surface },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  wordmark: { fontWeight: '700', fontSize: 23, letterSpacing: -0.4, color: colors.ink },
  route: { flex: 1, minHeight: 0 },
  navigation: { flexDirection: 'row', paddingTop: 7, paddingHorizontal: 16, backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  item: { flex: 1, minHeight: 55, alignItems: 'center', justifyContent: 'center', gap: 3 },
  icon: { width: 56, height: 30, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  active: { backgroundColor: colors.soft },
  label: { color: colors.muted, fontSize: 12, lineHeight: 17, fontWeight: '500' },
  activeLabel: { color: colors.green, fontWeight: '700' },
  unread: { position: 'absolute', top: 3, right: 12, width: 7, height: 7, borderRadius: 4, backgroundColor: colors.green, borderWidth: 1, borderColor: colors.surface },
});
