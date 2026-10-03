import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, Text, View } from 'react-native';
import { useApp } from '../state/AppProvider';
import { Button } from '../ui/Button';
import { Notice, errorMessage } from '../ui/Feedback';
import { Page, PageHeading } from '../ui/Page';
import { colors, layout, type } from '../ui/theme';

function periodLabel(period: string) {
  const periods: Record<string, string> = { P1D: 'día', P1W: 'semana', P1M: 'mes', P2M: '2 meses', P3M: '3 meses', P6M: '6 meses', P1Y: 'año', 'Compra única': 'pago único' };
  return periods[period] ?? 'según el plan de la tienda';
}

export default function Premium() {
  const app = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  async function load() {
    if (!app.session) { router.push('/auth'); return; }
    setBusy('load'); setError(null);
    try { await app.loadPurchaseOptions(); } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(null); }
  }
  async function purchase(identifier: string) {
    setBusy(identifier); setError(null); setMessage(null);
    try { const confirmed = await app.purchase(identifier); setMessage(confirmed ? 'Compra verificada. Premium está activo en tu cuenta.' : 'La tienda registró la compra. Estamos verificando el acceso; puedes restaurar compras en unos momentos.'); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(null); }
  }
  async function restore() {
    if (!app.session) { router.push('/auth'); return; }
    setBusy('restore'); setError(null); setMessage(null);
    try { const confirmed = await app.restorePurchases(); setMessage(confirmed ? 'Recuperaste tu acceso Premium.' : 'No hay acceso Premium confirmado en esta cuenta. Si acabas de comprar, vuelve a intentar en unos momentos.'); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(null); }
  }
  async function manage() {
    try { await Linking.openURL(Platform.OS === 'ios' ? 'https://apps.apple.com/account/subscriptions' : 'https://play.google.com/store/account/subscriptions'); }
    catch (e) { setError(errorMessage(e)); }
  }
  return <Page>
    <Button label="Volver al perfil" icon="arrow-back-outline" variant="ghost" style={{ alignSelf: 'flex-start', paddingLeft: 0 }} onPress={() => router.canGoBack() ? router.back() : router.replace('/profile')} />
    <PageHeading title="Premium" body="Más opciones para publicar tus lugares." />
    <View style={{ gap: 18 }}>
      <View style={layout.row}><Ionicons name="map-outline" size={24} color={colors.green} /><View style={{ flex: 1, gap: 4 }}><Text style={type.label}>Cualquier punto del mapa</Text><Text style={type.small}>Elige dónde publicar, aunque no estés ahí.</Text></View></View>
      <View style={layout.row}><Ionicons name="images-outline" size={24} color={colors.green} /><View style={{ flex: 1, gap: 4 }}><Text style={type.label}>Fotos de tu galería</Text><Text style={type.small}>También puedes seguir usando la cámara.</Text></View></View>
    </View>
    <Text style={type.small}>La cuenta gratuita permite publicar con la cámara desde tu ubicación actual.</Text>
    {error && <Notice tone="error">{error}</Notice>}
    {message && <Notice tone={app.premium ? 'success' : 'info'}>{message}</Notice>}
    {app.premium ? <View style={{ gap: 12 }}>
      <Text style={type.heading}>Premium activo</Text>
      <Button label="Gestionar mi suscripción" variant="secondary" icon="open-outline" onPress={() => void manage()} />
      <Button label="Publicar un lugar" icon="add-outline" onPress={() => router.navigate('/publish')} />
    </View> : app.purchaseOptions.length ? <View style={{ gap: 16 }}>{app.purchaseOptions.map(option => <View key={option.identifier} style={{ gap: 10 }}>
      <Text style={type.heading}>{option.title}</Text><Text style={type.title}>{option.price}<Text style={type.small}> / {periodLabel(option.period)}</Text></Text>
      <Button label="Continuar con este plan" icon="arrow-forward-outline" onPress={() => void purchase(option.identifier)} loading={busy === option.identifier} disabled={!!busy} />
    </View>)}<Button label="Actualizar planes" variant="ghost" icon="refresh-outline" onPress={() => void load()} loading={busy === 'load'} disabled={!!busy} /></View> : <Button label={app.session ? 'Consultar planes en la tienda' : 'Crear cuenta para continuar'} icon="sparkles-outline" onPress={() => void load()} loading={busy === 'load'} disabled={!!busy} />}
    <Button label="Restaurar compras" icon="refresh-outline" variant="secondary" onPress={() => void restore()} loading={busy === 'restore'} disabled={!!busy} />
    <Text style={type.small}>La tienda muestra el precio antes de confirmar. Puedes gestionar o cancelar la suscripción en App Store o Google Play. Restaurar no vuelve a cobrarte.</Text>
  </Page>;
}
