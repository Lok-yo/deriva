import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';
import { colors, type } from './theme';
import type { IconName } from './Button';

const sensors: { icon: IconName; title: string; body: string }[] = [
  { icon: 'camera-outline', title: 'Cámara', body: 'Comparte lo que tienes delante.' },
  { icon: 'location-outline', title: 'GPS', body: 'Sitúa tu hallazgo en el mapa.' },
  { icon: 'compass-outline', title: 'Brújula', body: 'Encuentra el rumbo a otro lugar.' },
  { icon: 'finger-print-outline', title: 'Biometría', body: 'Verifica tu identidad antes de la foto.' },
];

export function SensorGuide() {
  return <View style={styles.container}>
    <Text style={type.eyebrow}>CUATRO FORMAS DE CONECTAR CON EL MUNDO</Text>
    <View style={styles.grid}>{sensors.map(sensor => <View key={sensor.title} style={styles.sensor}><Ionicons name={sensor.icon} size={22} color={colors.green} /><View style={{ gap: 4, flex: 1 }}><Text style={type.label}>{sensor.title}</Text><Text style={type.small}>{sensor.body}</Text></View></View>)}</View>
    <Text style={[type.small, { fontSize: 11 }]}>La huella o Face ID se comprueban en tu teléfono. Deriva no recibe tus datos biométricos.</Text>
  </View>;
}

const styles = StyleSheet.create({
  container: { gap: 16, borderTopWidth: 1, borderColor: colors.border, paddingTop: 24 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 20 },
  sensor: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, width: 220, flexGrow: 1 },
});
