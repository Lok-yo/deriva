import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';
import { bearingDegrees, distanceMeters, formatDistance, relativeHeading } from '../domain/geo';
import type { Coordinate } from '../domain/models';
import { Button } from './Button';
import { Notice } from './Feedback';
import { colors, layout, type } from './theme';
import { useCompass } from './useCompass';

export function CompassPanel({ destination, preview }: { destination: Coordinate; preview: boolean }) {
  const compass = useCompass();
  const distance = compass.position ? distanceMeters(compass.position, destination) : null;
  const bearing = compass.position ? bearingDegrees(compass.position, destination) : null;
  const rotation = bearing != null && compass.heading != null ? relativeHeading(bearing, compass.heading) : 0;
  return <View style={layout.card}>
    <View style={[layout.row, { justifyContent: 'space-between' }]}><Text accessibilityRole="header" style={type.heading}>Sigue el rumbo</Text><Ionicons name="compass-outline" size={23} color={colors.green} /></View>
    <Text style={type.small}>{preview ? 'Este destino es un ejemplo. La brújula usa los sensores reales de tu teléfono si decides activarla.' : 'Activa el GPS y la brújula para orientarte hacia este punto.'}</Text>
    {compass.error && <Notice tone="error">{compass.error}</Notice>}
    {compass.position && <View style={{ alignItems: 'center', gap: 16 }}>
      <View accessibilityLabel={compass.heading == null ? 'Brújula esperando datos del magnetómetro' : `Destino a ${Math.round(rotation)} grados respecto al frente del teléfono`} style={styles.dial}>
        <View style={styles.innerRing} />
        <View style={[styles.rose, { transform: [{ rotate: `${-(compass.heading ?? 0)}deg` }], opacity: compass.heading == null ? 0.25 : 1 }]}><Text style={[styles.cardinal, styles.north]}>N</Text><Text style={[styles.cardinal, styles.east]}>E</Text><Text style={[styles.cardinal, styles.south]}>S</Text><Text style={[styles.cardinal, styles.west]}>O</Text></View>
        <View style={{ transform: [{ rotate: `${rotation}deg` }], opacity: compass.heading == null ? 0.25 : 1 }}><Ionicons name="arrow-up" size={82} color={colors.green} /></View>
      </View>
      <View style={{ alignItems: 'center', gap: 3 }}><Text style={type.title}>{distance != null ? formatDistance(distance) : '—'}</Text><Text style={type.small}>{distance != null && compass.position && distance <= Math.max(20, compass.position.accuracy) ? 'Estás cerca del punto, dentro de la precisión del GPS.' : 'Distancia desde la última lectura del GPS'}</Text></View>
      <Text style={[type.small, { textAlign: 'center', fontSize: 11 }]}>{compass.heading == null ? 'Esperando lectura del magnetómetro…' : `Rumbo del teléfono ${Math.round(compass.heading)}° · destino ${Math.round(bearing ?? 0)}°`}{`\n`}GPS: precisión ±{Math.round(compass.position.accuracy)} m</Text>
    </View>}
    <View style={layout.wrap}>{compass.active ? <><Button label="Actualizar GPS" icon="locate-outline" variant="secondary" onPress={() => void compass.refreshPosition()} loading={compass.busy} /><Button label="Detener brújula" variant="ghost" onPress={compass.deactivate} /></> : <Button label="Activar GPS y brújula" icon="compass-outline" onPress={() => void compass.activate()} loading={compass.busy} />}</View>
    <Text style={[type.small, { fontSize: 11 }]}>Sostén el teléfono plano y calibra con un movimiento en forma de ocho. El rumbo magnético es aproximado; los metales cercanos pueden alterarlo. La brújula se detiene al salir de esta pantalla.</Text>
  </View>;
}

const styles = StyleSheet.create({
  dial: { width: 188, height: 188, borderRadius: 94, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.soft, position: 'relative' },
  innerRing: { position: 'absolute', width: 148, height: 148, borderRadius: 74, borderWidth: 1, borderColor: colors.border },
  rose: { position: 'absolute', top: 0, left: 0, width: 188, height: 188, alignItems: 'center', justifyContent: 'center' },
  cardinal: { position: 'absolute', fontSize: 11, lineHeight: 16, color: colors.muted, fontWeight: '600' },
  north: { top: 8 }, east: { right: 10 }, south: { bottom: 8 }, west: { left: 10 },
});
