import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, type } from './theme';
import type { Arrival } from './useArrival';

export function unlockSummary({ isAdmin, visitCount, requiredVisits, remoteUnlocked }: { isAdmin: boolean; visitCount: number; requiredVisits: number; remoteUnlocked: boolean }) {
  if (isAdmin) return 'Como administrador puedes agregar ubicaciones en cualquier punto sin explorar ni pagar.';
  if (remoteUnlocked) return 'Desbloqueaste las ubicaciones de pago: toca cualquier punto del mapa para dejar tu ? por 1 USD.';
  const left = requiredVisits - visitCount;
  return `Visita ${left === 1 ? '1 lugar más' : `${left} lugares más`} para desbloquear las ubicaciones de pago en cualquier punto del mapa.`;
}

/** One segment per required visit; extra visits beyond the requirement only change the count. */
export function ExplorationMeter({ visits, required }: { visits: number; required: number }) {
  return <View accessible accessibilityRole="progressbar" accessibilityLabel={`${Math.min(visits, required)} de ${required} visitas`} accessibilityValue={{ min: 0, max: required, now: Math.min(visits, required) }} style={styles.meter}>
    {Array.from({ length: required }, (_, index) => <View key={index} style={[styles.segment, index < visits && styles.filled]} />)}
  </View>;
}

export function ArrivalBanner({ arrival, onDismiss }: { arrival: Arrival; onDismiss: () => void }) {
  const { place, result } = arrival;
  const body = result.justUnlocked
    ? 'Completaste la exploración. Ya puedes agregar una ubicación en cualquier punto del mapa.'
    : result.unlocked ? `Llevas ${result.visits} lugares visitados.`
      : `${result.visits}/${result.requiredVisits} visitas. ${result.requiredVisits - result.visits === 1 ? 'Te falta 1' : `Te faltan ${result.requiredVisits - result.visits}`} para desbloquear las ubicaciones de pago.`;
  return <View accessibilityLiveRegion="assertive" style={styles.banner} testID="arrival-banner">
    <View style={styles.icon}><Ionicons name={result.justUnlocked ? 'lock-open' : 'flag'} size={20} color={colors.onAccent} /></View>
    <Pressable accessibilityRole="button" accessibilityLabel={`Llegaste a ${place.title}. ${body} Ver tu exploración`} onPress={() => { onDismiss(); router.push('/exploration'); }} style={styles.copy}>
      <Text numberOfLines={2} style={type.label}>¡Llegaste a {place.title}!</Text>
      <Text style={styles.body}>{body}</Text>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Cerrar aviso de llegada" onPress={onDismiss} style={styles.dismiss}>
      <Ionicons name="close" size={20} color={colors.muted} />
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  meter: { flexDirection: 'row', gap: 6 },
  segment: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.soft, borderWidth: 1, borderColor: colors.border },
  filled: { backgroundColor: colors.green, borderColor: colors.green },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 12, paddingVertical: 10, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.green, boxShadow: '0px 3px 12px #00000035' },
  icon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, gap: 2 },
  body: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  dismiss: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
