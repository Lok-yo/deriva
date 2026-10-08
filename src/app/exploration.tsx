import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ARRIVAL_RADIUS_M, countsAsVisit } from '../domain/exploration';
import { describeHeading, rankNearby } from '../domain/geo';
import { useApp } from '../state/AppProvider';
import { Button } from '../ui/Button';
import { ExplorationMeter, unlockSummary } from '../ui/Exploration';
import { EmptyState } from '../ui/Feedback';
import { Page, PageHeading } from '../ui/Page';
import { colors, layout, type } from '../ui/theme';

const steps = [
  'Elige un ? en el mapa o toca A la deriva.',
  'Abre la ficha y activa GPS y brújula. La distancia se actualiza mientras caminas.',
  `Al llegar a menos de ${ARRIVAL_RADIUS_M} m la visita se registra sola. También puedes tocar Ya llegué.`,
  'Tus propias publicaciones no cuentan: explora las de otras personas y los ejemplos.',
];

export default function Exploration() {
  const app = useApp();
  const userId = app.session?.user.id;
  const pending = rankNearby(app.places.filter(place => countsAsVisit(place, userId) && !app.visitedIds.has(place.id)), app.mapLocation.position).slice(0, 5);
  const visited = app.visits.map(visit => ({ visit, place: app.places.find(place => place.id === visit.place_key) }));
  const gone = visited.filter(item => !item.place).length;
  const open = (id: string) => router.push({ pathname: '/place/[id]', params: { id } });
  return <Page>
    <Button label="Volver" icon="arrow-back-outline" variant="ghost" style={{ alignSelf: 'flex-start', paddingLeft: 0 }} onPress={() => router.canGoBack() ? router.back() : router.replace('/')} />
    <PageHeading title="Exploración" body="Llega en persona a los ? del mapa. Cada lugar que visitas de verdad suma a tu progreso." />
    {!app.session ? <EmptyState title="Tus pasos merecen contarse." body={`Inicia sesión para registrar tus visitas. Con ${app.requiredVisits} lugares visitados desbloqueas las ubicaciones de pago en cualquier punto del mapa.`} icon="footsteps-outline" action="Crear cuenta o iniciar sesión" onAction={() => router.push('/auth')} /> : <>
      <View style={layout.card} testID="exploration-summary">
        <View style={layout.row}>
          <View style={styles.badge}><Ionicons name={app.remoteUnlocked ? 'lock-open' : 'lock-closed'} size={22} color={colors.onAccent} /></View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={type.eyebrow}>{app.remoteUnlocked ? 'DESBLOQUEADO' : 'UBICACIONES DE PAGO'}</Text>
            <Text style={type.title}>{app.remoteUnlocked ? `${app.visitCount} visitados` : `${app.visitCount}/${app.requiredVisits}`}</Text>
          </View>
        </View>
        <ExplorationMeter visits={app.visitCount} required={app.requiredVisits} />
        <Text style={type.small}>{unlockSummary(app)}</Text>
        {app.remoteUnlocked
          ? <Button label="Elegir un punto en el mapa" icon="add-outline" onPress={() => router.navigate('/')} />
          : <Button label="Ir a explorar" icon="compass-outline" variant="secondary" onPress={() => router.navigate('/')} />}
      </View>
      <View style={layout.section}>
        <Text accessibilityRole="header" style={type.heading}>Cómo se cuenta una visita</Text>
        {steps.map((step, index) => <View key={step} style={styles.step}>
          <Text style={styles.stepNumber}>{index + 1}</Text>
          <Text style={[type.small, { flex: 1 }]}>{step}</Text>
        </View>)}
      </View>
      {pending.length > 0 && <View style={layout.section}>
        <Text accessibilityRole="header" style={type.heading}>{app.mapLocation.position ? 'Por visitar cerca de ti' : 'Por visitar'}</Text>
        {pending.map(item => <Pressable key={item.place.id} accessibilityRole="button" accessibilityLabel={`${item.place.title}. ${describeHeading(item) ?? 'Por visitar'}`} onPress={() => open(item.place.id)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
          <View style={styles.mystery}><Text style={styles.mysteryMark}>?</Text></View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text numberOfLines={1} style={type.label}>{item.place.title}</Text>
            <Text style={type.small}>{describeHeading(item) ?? 'Por visitar'}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>)}
      </View>}
      <View style={layout.section}>
        <Text accessibilityRole="header" style={type.heading}>Visitados</Text>
        {visited.length ? visited.map(({ visit, place }) => place && <Pressable key={visit.place_key} accessibilityRole="button" accessibilityLabel={`${place.title}, visitado`} onPress={() => open(place.id)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
          <View style={[styles.mystery, styles.done]}><Ionicons name="flag" size={20} color={colors.onAccent} /></View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text numberOfLines={1} style={type.label}>{place.title}</Text>
            <Text style={type.small}>{new Date(visit.visited_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>) : <Text style={type.small}>Todavía no visitas ningún lugar. El primer ? te espera en el mapa.</Text>}
        {gone > 0 && <Text style={type.small}>{gone === 1 ? 'Un lugar que visitaste ya no está en el mapa; sigue contando.' : `${gone} lugares que visitaste ya no están en el mapa; siguen contando.`}</Text>}
      </View>
    </>}
  </Page>;
}

const styles = StyleSheet.create({
  badge: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  stepNumber: { width: 24, height: 24, borderRadius: 12, overflow: 'hidden', textAlign: 'center', lineHeight: 24, fontSize: 12, fontWeight: '700', color: colors.onAccent, backgroundColor: colors.green },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  mystery: { width: 46, height: 46, borderRadius: 10, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' },
  done: { backgroundColor: colors.green },
  mysteryMark: { color: colors.green, fontSize: 22, lineHeight: 26, fontWeight: '800' },
  pressed: { opacity: 0.7 },
});
