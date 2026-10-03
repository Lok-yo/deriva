import { useState } from 'react';
import { Text, View } from 'react-native';
import type { Coordinate, Position } from '../domain/models';
import { MapView } from '../maps/MapView';
import { Button } from './Button';
import { Field } from './Forms';
import { layout, type } from './theme';

export function LocationPicker({ coordinate, position, premium, busy, onLocate, onChange }: { coordinate: Coordinate | null; position: Position | null; premium: boolean; busy: string | null; onLocate: () => void; onChange: (value: Coordinate) => void }) {
  return <View style={{ gap: 14 }}>
    <Text accessibilityRole="header" style={type.heading}>02 · El punto de encuentro</Text>
    <Text style={type.small}>{premium ? 'Toca el mapa para elegir cualquier punto. También puedes escribir sus coordenadas.' : 'Publicarás en el punto donde estás. Obtendremos una nueva lectura al enviar.'}</Text>
    <MapView center={coordinate ?? position} origin={position} selected={coordinate} selectable={premium && !busy} onSelectCoordinate={onChange} style={{ height: 290, flex: 0 }} />
    <Button label={coordinate ? 'Usar mi ubicación actual' : 'Obtener ubicación GPS'} icon="locate-outline" variant="secondary" onPress={onLocate} loading={busy === 'gps'} disabled={!!busy} />
    {coordinate && <Text style={type.small}>{coordinate.latitude.toFixed(6)}, {coordinate.longitude.toFixed(6)}{position && !premium ? ` · precisión ±${Math.round(position.accuracy)} m` : ''}</Text>}
    {premium && <CoordinateFields key={coordinate ? `${coordinate.latitude}:${coordinate.longitude}` : 'unset'} coordinate={coordinate} busy={busy} onChange={onChange} />}
  </View>;
}

function CoordinateFields({ coordinate, busy, onChange }: { coordinate: Coordinate | null; busy: string | null; onChange: (value: Coordinate) => void }) {
  const [latitude, setLatitude] = useState(coordinate?.latitude.toFixed(6) ?? '');
  const [longitude, setLongitude] = useState(coordinate?.longitude.toFixed(6) ?? '');
  const [invalid, setInvalid] = useState<string | null>(null);
  function applyCoordinates() {
    const lat = Number(latitude.replace(',', '.')), lon = Number(longitude.replace(',', '.'));
    if (!latitude.trim() || !longitude.trim() || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) { setInvalid('Usa una latitud entre −90 y 90 y una longitud entre −180 y 180.'); return; }
    setInvalid(null); onChange({ latitude: lat, longitude: lon });
  }
  return <View style={{ gap: 12 }}>
      <View style={[layout.row, { alignItems: 'flex-start' }]}><View style={{ flex: 1 }}><Field label="Latitud" value={latitude} onChangeText={setLatitude} placeholder="29.072967" keyboardType="numbers-and-punctuation" editable={!busy} /></View><View style={{ flex: 1 }}><Field label="Longitud" value={longitude} onChangeText={setLongitude} placeholder="−110.955919" keyboardType="numbers-and-punctuation" editable={!busy} /></View></View>
      {invalid && <Text style={type.small}>{invalid}</Text>}
      <Button label="Usar estas coordenadas" variant="ghost" icon="checkmark-outline" onPress={applyCoordinates} disabled={!!busy} />
    </View>;
}
