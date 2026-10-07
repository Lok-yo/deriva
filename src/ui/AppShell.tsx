import Ionicons from '@expo/vector-icons/Ionicons';
import { useSegments, type Tabs } from 'expo-router';
import { CommonActions } from 'expo-router/react-navigation';
import { StatusBar } from 'expo-status-bar';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../state/AppProvider';
import type { IconName } from './Button';
import { colors } from './theme';

const destinations: Record<string, { title: string; icon: IconName; activeIcon: IconName }> = {
  index: { title: 'Explorar', icon: 'compass-outline', activeIcon: 'compass' },
  publish: { title: 'Publicar', icon: 'add-circle-outline', activeIcon: 'add-circle' },
  profile: { title: 'Perfil', icon: 'person-outline', activeIcon: 'person' },
};

export function Brand({ small = false }: { small?: boolean }) {
  return <View style={styles.brand}><Ionicons name="compass-outline" size={small ? 21 : 25} color={colors.ink} /><Text style={[styles.wordmark, small && { fontSize: 19 }]}>Deriva</Text></View>;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  return <View style={[styles.shell, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right, paddingBottom: segments[0] === '(tabs)' ? 0 : insets.bottom }]}>
    <StatusBar style="light" />
    <View style={styles.route}>{children}</View>
  </View>;
}

type TabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0];

export function DerivaTabBar({ state, navigation, insets }: TabBarProps) {
  const app = useApp();
  const unread = app.notifications.filter(notification => !notification.read_at).length;
  return <View accessibilityRole="tablist" style={[styles.navigation, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {state.routes.map((route, index) => {
        const item = destinations[route.name];
        if (!item) return null;
        const active = state.index === index;
        return <Pressable
          key={route.key}
          accessibilityRole="tab"
          accessibilityLabel={item.title}
          accessibilityState={{ selected: active }}
          onPress={() => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!active && !event.defaultPrevented) navigation.dispatch({ ...CommonActions.navigate(route), target: state.key });
          }}
          onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
          style={({ pressed }) => [styles.item, pressed && { opacity: 0.6 }]}
        >
          <View style={[styles.icon, active && styles.active]}>
            <Ionicons name={active ? item.activeIcon : item.icon} size={23} color={active ? colors.green : colors.muted} />
            {route.name === 'profile' && unread > 0 && <View style={styles.unread} />}
          </View>
          <Text style={[styles.label, active && styles.activeLabel]}>{item.title}</Text>
        </Pressable>;
      })}
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
