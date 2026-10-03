import { useEffect } from 'react';
import { Stack, router, type ErrorBoundaryProps } from 'expo-router';
import { Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider, useApp } from '../state/AppProvider';
import { listenForNotificationTaps } from '../services/notifications';
import { AppShell } from '../ui/AppShell';
import { Button } from '../ui/Button';
import { colors, type } from '../ui/theme';

function Routes() {
  const { ready } = useApp();
  useEffect(() => {
    if (!ready) return;
    return listenForNotificationTaps(id => router.push({ pathname: '/place/[id]', params: { id } }));
  }, [ready]);
  return <AppShell><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: 'slide_from_right' }} /></AppShell>;
}

export default function RootLayout() {
  return <SafeAreaProvider><AppProvider><Routes /></AppProvider></SafeAreaProvider>;
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <View style={{ flex: 1, backgroundColor: colors.background, padding: 32, alignItems: 'center', justifyContent: 'center', gap: 20 }}><Text style={type.title}>Volvamos al camino.</Text><Text style={[type.body, { textAlign: 'center' }]}>{error.message}</Text><Button label="Intentar de nuevo" onPress={() => void retry()} /></View>;
}
