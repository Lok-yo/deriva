import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';
import { colors, type } from './theme';

const features = [
  { label: 'Explorar y usar la brújula', free: true },
  { label: 'Guardar lugares y recibir alertas', free: true },
  { label: 'Publicar con cámara y GPS actual', free: true },
  { label: 'Elegir cualquier punto del mapa', free: false },
  { label: 'Publicar fotos de tu galería', free: false },
];

export function PremiumComparison() {
  return <View style={styles.table}>
    <View style={styles.row}><Text accessibilityRole="header" style={[type.label, { flex: 1 }]}>Tu forma de descubrir</Text><Text style={styles.column}>Gratis</Text><Text style={styles.column}>Premium</Text></View>
    {features.map(feature => <View key={feature.label} style={styles.row}><Text style={[type.small, { flex: 1, color: colors.ink }]}>{feature.label}</Text><View style={styles.check}><Ionicons accessibilityLabel={feature.free ? 'Incluido en Gratis' : 'Disponible con Premium'} name={feature.free ? 'checkmark-outline' : 'remove-outline'} size={20} color={feature.free ? colors.green : colors.muted} /></View><View style={styles.check}><Ionicons accessibilityLabel="Incluido en Premium" name="checkmark-outline" size={20} color={colors.green} /></View></View>)}
  </View>;
}

const styles = StyleSheet.create({
  table: { borderTopWidth: 1, borderColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 17, borderBottomWidth: 1, borderColor: colors.border },
  column: { color: colors.ink, fontSize: 11, lineHeight: 18, width: 62, textAlign: 'center', fontWeight: '600' },
  check: { width: 62, alignItems: 'center' },
});
