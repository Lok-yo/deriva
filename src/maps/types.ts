import type { StyleProp, ViewStyle } from 'react-native';
import type { Coordinate, Place } from '../domain/models';

export type MapProps = {
  places?: Place[];
  center?: Coordinate | null;
  origin?: Coordinate | null;
  selected?: Coordinate | null;
  selectedId?: string | null;
  selectable?: boolean;
  cameraRequest?: { id: number; center: Coordinate; zoom?: number };
  edgeToEdge?: boolean;
  onSelectPlace?: (id: string) => void;
  onSelectCoordinate?: (coordinate: Coordinate) => void;
  style?: StyleProp<ViewStyle>;
};

export type MapMessage = {
  derivaMap: string;
  type: 'ready' | 'error' | 'place' | 'coordinate';
  id?: string;
  latitude?: number;
  longitude?: number;
};

export function parseMapMessage(value: unknown, bridge: string): MapMessage | null {
  try {
    const data = typeof value === 'string' ? JSON.parse(value) : value;
    if (!data || typeof data !== 'object' || data.derivaMap !== bridge) return null;
    if (!['ready', 'error', 'place', 'coordinate'].includes(data.type)) return null;
    if (data.type === 'place' && typeof data.id !== 'string') return null;
    if (data.type === 'coordinate' && (!Number.isFinite(data.latitude) || !Number.isFinite(data.longitude) || Math.abs(data.latitude) > 90 || Math.abs(data.longitude) > 180)) return null;
    return data as MapMessage;
  } catch { return null; }
}
