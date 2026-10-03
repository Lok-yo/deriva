import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useApp } from '../state/AppProvider';
import { Button } from '../ui/Button';
import { Badge, Notice, errorMessage } from '../ui/Feedback';
import { Page } from '../ui/Page';
import { PremiumComparison } from '../ui/PremiumComparison';
import { colors, layout, serif, type } from '../ui/theme';

function periodLabel(period: string) {
  const periods: Record<string, string> = { P1D: 'día', P1W: 'semana', P1M: 'mes', P2M: '2 meses', P3M: '3 meses', P6M: '6 meses', P1Y: 'año', 'Compra única': 'pago único' };
  return periods[period] ?? 'según el plan de la tienda';
}

export default function Premium() {
  const app = useApp();
  const { width } = useWindowDimensions();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  async function load() {
    if (!app.session || app.isPreview) { router.push('/auth'); return; }
    setBusy('load'); setError(null);
    try { await app.loadPurchaseOptions(); } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(null); }
  }
  async function purchase(identifier: string) {
    setBusy(identifier); setError(null); setMessage(null);
    try { const confirmed = await app.purchase(identifier); setMessage(confirmed ? 'Compra verificada. Premium está activo en tu cuenta.' : 'La tienda registró la compra; estamos verificando el acceso. Actualiza en unos momentos o usa Restaurar compras.'); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(null); }
  }
  async function restore() {
    if (!app.session || app.isPreview) { router.push('/auth'); return; }
    setBusy('restore'); setError(null); setMessage(null);
    try { const confirmed = await app.restorePurchases(); setMessage(confirmed ? 'Compra verificada. Recuperaste tu acceso Premium.' : 'No hay acceso Premium confirmado en esta cuenta. Si acabas de comprar, vuelve a restaurar en unos momentos.'); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(null); }
  }
  async function manage() {
    try { await Linking.openURL(Platform.OS === 'ios' ? 'https://apps.apple.com/account/subscriptions' : 'https://play.google.com/store/account/subscriptions'); }
    catch (e) { setError(errorMessage(e)); }
  }
  return <Page style={{ maxWidth: 1050 }}>
    <Button label="Volver" icon="arrow-back-outline" variant="ghost" style={{ alignSelf: 'flex-start', paddingLeft: 0 }} onPress={() => router.canGoBack() ? router.back() : router.replace('/profile')} />
    <View style={[styles.columns, width >= 1100 && { flexDirection: 'row' }]}>
      <View style={[styles.hero, { flex: 1 }]}><Badge text="DERIVA PREMIUM" dark /><Text accessibilityRole="header" style={styles.heroTitle}>Tu mirada,{`\n`}un poco más allá.</Text><Text style={styles.heroBody}>Ese lugar de tu último viaje. Esa foto que espera una historia. Comparte desde donde imaginas, con el punto que tú elijas.</Text><View style={styles.feature}><Ionicons name="map-outline" size={26} color={colors.ink} /><View style={{ flex: 1 }}><Text style={type.label}>Elige el punto.</Text><Text style={type.small}>Cualquier coordenada, desde el mapa.</Text></View></View><View style={styles.feature}><Ionicons name="images-outline" size={26} color={colors.ink} /><View style={{ flex: 1 }}><Text style={type.label}>Comparte tu mirada.</Text><Text style={type.small}>Usa las fotografías de tu galería.</Text></View></View></View>
      <View style={{ flex: 1, gap: 24 }}>
        <PremiumComparison />
        {error && <Notice tone="error">{error}</Notice>}
        {message && <Notice tone={app.premium ? 'success' : 'info'}>{message}</Notice>}
        {app.premium ? <View style={layout.card}><Badge text="PREMIUM ACTIVO" /><Text accessibilityRole="header" style={type.heading}>Ya tienes un mundo de posibilidades.</Text><Text style={type.small}>Tu acceso está verificado en el servidor y disponible en esta cuenta.</Text><Button label="Gestionar mi suscripción" variant="secondary" icon="open-outline" onPress={() => void manage()} /><Button label="Publicar un lugar" icon="add-outline" onPress={() => router.navigate('/publish')} /></View> : app.purchaseOptions.length ? <View style={{ gap: 12 }}>{app.purchaseOptions.map(option => <View key={option.identifier} style={layout.card}><Text accessibilityRole="header" style={type.heading}>{option.title}</Text><Text style={[type.title, { fontSize: 30 }]}>{option.price}<Text style={type.small}> / {periodLabel(option.period)}</Text></Text><Button label="Continuar con este plan" icon="arrow-forward-outline" onPress={() => void purchase(option.identifier)} loading={busy === option.identifier} disabled={!!busy} /></View>)}<Button label="Actualizar planes" variant="ghost" icon="refresh-outline" onPress={() => void load()} loading={busy === 'load'} disabled={!!busy} /></View> : <View style={layout.card}><Text accessibilityRole="header" style={type.heading}>Elige tu próxima forma de explorar.</Text><Text style={type.small}>{app.session ? 'Consulta los planes y precios disponibles en la tienda de tu teléfono.' : 'Primero crea tu cuenta gratuita. Después podrás consultar los planes disponibles en Android o iOS.'}</Text><Button label={app.session ? 'Consultar planes en la tienda' : 'Crear cuenta para continuar'} icon="sparkles-outline" onPress={() => void load()} loading={busy === 'load'} disabled={!!busy} /></View>}
        <Button label="Restaurar compras" icon="refresh-outline" variant="secondary" onPress={() => void restore()} loading={busy === 'restore'} disabled={!!busy} />
        <Text style={[type.small, { fontSize: 11 }]}>El precio y las condiciones se muestran en tu tienda antes de confirmar. Gestiona o cancela tu suscripción en App Store o Google Play. Restaurar compras no vuelve a cobrarte.</Text>
      </View>
    </View>
  </Page>;
}

const styles = StyleSheet.create({
  columns: { gap: 32 },
  hero: { backgroundColor: colors.lime, padding: 28, borderRadius: 12, gap: 24 },
  heroTitle: { fontFamily: serif, fontSize: 43, lineHeight: 49, color: colors.ink, letterSpacing: -1.5 },
  heroBody: { color: colors.ink, fontSize: 15, lineHeight: 25 },
  feature: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingTop: 16, borderTopWidth: 1, borderColor: '#BFCF69' },
});
