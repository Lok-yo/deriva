import { Tabs } from 'expo-router';
import { DerivaTabBar } from '../../ui/AppShell';
import { colors } from '../../ui/theme';

export default function TabLayout() {
  return <Tabs
    initialRouteName="index"
    backBehavior="initialRoute"
    screenOptions={{ headerShown: false, animation: 'none', sceneStyle: { backgroundColor: colors.background } }}
    tabBar={props => <DerivaTabBar {...props} />}
  >
    <Tabs.Screen name="index" options={{ title: 'Mapa' }} />
    <Tabs.Screen name="publish" options={{ title: 'Publicar' }} />
    <Tabs.Screen name="profile" options={{ title: 'Perfil' }} />
  </Tabs>;
}
