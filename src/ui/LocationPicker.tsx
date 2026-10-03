import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SLRC_CENTER } from '../data/preview';
import type { Coordinate, Position } from '../domain/models';
import { MapView } from '../maps/MapView';
import type { MapProps } from '../maps/types';
import { useApp } from '../state/AppProvider';
import { Button } from './Button';
import { Field } from './Forms';
import { colors, layout, type } from './theme';

export function LocationPicker({ coordinate, position, premium, busy, onLocate, onChange }: { coordinate: Coordinate | null; position: Position | null; premium: boolean; busy: string | null; onLocate: () => void; onChange: (value: Coordinate) => void }) {
  const app = useApp();
  const [showMap, setShowMap] = useState(false);
  const [showFields, setShowFields] = useState(false);
  const [camera, setCamera] = useState<{ position: Position | null; request: MapProps['cameraRequest'] }>({ position: null, request: undefined });
  const origin = position ?? app.mapLocation.position;
  // A fresh GPS reading supersedes an earlier manual camera request, even at the same point.
  if (position !== camera.position) setCamera({ position, request: position ? { id: (camera.request?.id ?? 0) + 1, center: position, zoom: 15 } : undefined });
  function applyCoordinates(value: Coordinate) {
    onChange(value);
    setCamera(current => ({ ...current, request: { id: (current.request?.id ?? 0) + 1, center: value, zoom: 15 } }));
  }
  return <View style={{ gap: 12 }}>
    <View style={[layout.row, { gap: 8 }]}><Ionicons name="location-outline" size={20} color={colors.green} /><Text accessibilityRole="header" style={type.label}>Ubicación</Text></View>
    {premium ? <>
      <Text style={type.small}>Toca el mapa para elegir el punto.</Text>
      <MapView center={origin ?? SLRC_CENTER} origin={origin} selected={coordinate} cameraRequest={camera.request} selectable={!busy} onSelectCoordinate={onChange} style={{ height: 260, flex: 0 }} />
    </> : <Text style={type.small}>{coordinate ? 'Publicarás desde tu ubicación actual.' : 'Al tomar la foto obtendremos el punto donde estás.'}</Text>}
    <Button label="Usar mi ubicación" icon="locate-outline" variant="secondary" onPress={onLocate} loading={busy === 'gps'} disabled={!!busy} />
    {coordinate && <Text style={type.small}>{coordinate.latitude.toFixed(5)}, {coordinate.longitude.toFixed(5)}{position && !premium ? ` · ±${Math.round(position.accuracy)} m` : ''}</Text>}
    {!premium && coordinate && <>
      <Pressable accessibilityRole="button" accessibilityLabel="Ver ubicación en mapa" accessibilityState={{ expanded: showMap }} onPress={() => setShowMap(value => !value)} style={{ minHeight: 48, justifyContent: 'center' }}><Text style={[type.small, { color: colors.green }]}>{showMap ? 'Ocultar mapa' : 'Ver en el mapa'}</Text></Pressable>
      {showMap && <MapView center={coordinate} origin={position} selected={coordinate} style={{ height: 220, flex: 0 }} />}
    </>}
    {premium && <>
      <Pressable accessibilityRole="button" accessibilityLabel="Escribir coordenadas" accessibilityState={{ expanded: showFields }} onPress={() => setShowFields(value => !value)} style={{ minHeight: 48, justifyContent: 'center' }}><Text style={[type.small, { color: colors.green }]}>{showFields ? 'Ocultar coordenadas' : 'Escribir coordenadas'}</Text></Pressable>
      {showFields && <CoordinateFields key={coordinate ? `${coordinate.latitude}:${coordinate.longitude}` : 'unset'} coordinate={coordinate} busy={busy} onChange={applyCoordinates} />}
    </>}
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
    <View style={[layout.row, { alignItems: 'flex-start' }]}><View style={{ flex: 1 }}><Field label="Latitud" value={latitude} onChangeText={setLatitude} placeholder="32.45688" keyboardType="numbers-and-punctuation" editable={!busy} /></View><View style={{ flex: 1 }}><Field label="Longitud" value={longitude} onChangeText={setLongitude} placeholder="−114.77971" keyboardType="numbers-and-punctuation" editable={!busy} /></View></View>
    {invalid && <Text style={type.small}>{invalid}</Text>}
    <Button label="Usar coordenadas" variant="secondary" icon="checkmark-outline" onPress={applyCoordinates} disabled={!!busy} />
  </View>;
}
