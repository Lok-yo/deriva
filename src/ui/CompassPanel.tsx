import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ARRIVAL_RADIUS_M } from '../domain/exploration';
import { bearingDegrees, distanceMeters, formatDistance, relativeHeading } from '../domain/geo';
import type { Coordinate, Position } from '../domain/models';
import { Button } from './Button';
import { Notice } from './Feedback';
import { colors, layout, type } from './theme';
import { useCompass } from './useCompass';

export function CompassPanel({ destination, onPosition }: { destination: Coordinate; onPosition?: (position: Position) => void }) {
  const compass = useCompass();
  const reading = compass.position;
  useEffect(() => { if (reading) onPosition?.(reading); }, [reading, onPosition]);
  const distance = compass.position ? distanceMeters(compass.position, destination) : null;
  const bearing = compass.position ? bearingDegrees(compass.position, destination) : null;
  const rotation = bearing != null && compass.heading != null ? relativeHeading(bearing, compass.heading) : 0;
  return <View style={[layout.card, styles.panel]}>
    <View style={[layout.row, { justifyContent: 'space-between' }]}><Text accessibilityRole="header" style={type.heading}>Sigue la brújula</Text><Ionicons name="compass-outline" size={24} color={colors.green} /></View>
    {compass.error && <Notice tone="error">{compass.error}</Notice>}
    {compass.active && compass.position && <>
      <View style={styles.reading}>
        <View accessibilityLabel={compass.heading == null ? 'Brújula esperando datos del magnetómetro' : `Destino a ${Math.round(rotation)} grados respecto al frente del teléfono`} style={styles.dial}>
          <View style={[styles.rose, { transform: [{ rotate: `${-(compass.heading ?? 0)}deg` }], opacity: compass.heading == null ? 0.25 : 1 }]}><Text style={[styles.cardinal, styles.north]}>N</Text><Text style={[styles.cardinal, styles.east]}>E</Text><Text style={[styles.cardinal, styles.south]}>S</Text><Text style={[styles.cardinal, styles.west]}>O</Text></View>
          <View style={{ transform: [{ rotate: `${rotation}deg` }], opacity: compass.heading == null ? 0.25 : 1 }}><Ionicons name="arrow-up" size={62} color={colors.green} /></View>
        </View>
        <View style={styles.distance}><Text style={type.title}>{distance != null ? formatDistance(distance) : '—'}</Text><Text style={type.small}>{distance != null && distance <= ARRIVAL_RADIUS_M ? 'Llegaste al lugar' : 'Hasta el lugar'}</Text><Text style={type.small}>GPS ±{Math.round(compass.position.accuracy)} m</Text></View>
      </View>
      <Text style={type.small}>{compass.heading == null ? 'Esperando el magnetómetro…' : 'Mantén el teléfono plano. La flecha señala el destino.'}</Text>
    </>}
    {compass.active ? <View style={layout.wrap}><Button label="Actualizar GPS" icon="locate-outline" variant="secondary" onPress={() => void compass.refreshPosition()} loading={compass.busy} /><Button label="Detener" variant="ghost" onPress={compass.deactivate} /></View> : <Button label="Activar GPS y brújula" icon="compass-outline" onPress={() => void compass.activate()} loading={compass.busy} />}
  </View>;
}

const styles = StyleSheet.create({
  panel: { gap: 14, padding: 18 },
  reading: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 20 },
  distance: { gap: 4, flexShrink: 1 },
  dial: { width: 144, height: 144, borderRadius: 72, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, position: 'relative' },
  rose: { position: 'absolute', top: 0, left: 0, width: 144, height: 144, alignItems: 'center', justifyContent: 'center' },
  cardinal: { position: 'absolute', fontSize: 10, lineHeight: 14, color: colors.muted, fontWeight: '600' },
  north: { top: 8 }, east: { right: 10 }, south: { bottom: 8 }, west: { left: 10 },
});
