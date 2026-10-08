import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { Magnetometer } from 'expo-sensors';
import { headingFromMagnetometer, normalizeHeading, relativeHeading } from '../domain/geo';
import type { Position } from '../domain/models';

export async function getCurrentPosition(): Promise<Position> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') throw new Error('Activa el permiso de ubicación para usar el GPS. Puedes cambiarlo en Ajustes.');
  if (!await Location.hasServicesEnabledAsync()) throw new Error('Enciende la ubicación del teléfono e intenta de nuevo.');
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('El GPS tardó demasiado. Intenta al aire libre.')), 25000); }),
    ]);
    if (result.mocked) throw new Error('La ubicación del teléfono aparece como simulada. Usa una lectura real del GPS.');
    const accuracy = result.coords.accuracy;
    if (accuracy == null || !Number.isFinite(accuracy) || accuracy > 100) throw new Error('El GPS todavía tiene poca precisión. Intenta al aire libre.');
    return { latitude: result.coords.latitude, longitude: result.coords.longitude, accuracy, timestamp: new Date(result.timestamp).toISOString(), mocked: result.mocked ?? false };
  } finally { if (timeout) clearTimeout(timeout); }
}

/** Foreground-only updates while walking. Readings are passed through; callers decide if they are precise enough. */
export async function watchPosition(onPosition: (position: Position) => void): Promise<() => void> {
  const subscription = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, distanceInterval: 5, timeInterval: 4000 }, result => {
    const { latitude, longitude, accuracy } = result.coords;
    if (accuracy == null || !Number.isFinite(accuracy) || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    onPosition({ latitude, longitude, accuracy, timestamp: new Date(result.timestamp).toISOString(), mocked: result.mocked ?? false });
  });
  return () => subscription.remove();
}

export async function subscribeCompass(onHeading: (degrees: number) => void): Promise<() => void> {
  if (Platform.OS === 'web') throw new Error('La brújula está disponible en la app Android o iOS. Abre Deriva en tu teléfono.');
  if (!await Magnetometer.isAvailableAsync()) throw new Error('Este teléfono no tiene un magnetómetro disponible.');
  const permission = await Magnetometer.requestPermissionsAsync();
  if (permission.status !== 'granted') throw new Error('Permite el acceso al movimiento del teléfono para usar la brújula.');
  Magnetometer.setUpdateInterval(150);
  let previous: number | null = null;
  const listener = Magnetometer.addListener(({ x, y }) => {
    const heading = headingFromMagnetometer(x, y);
    if (heading == null) return;
    previous = previous == null ? heading : normalizeHeading(previous + relativeHeading(heading, previous) * 0.22);
    onHeading(previous);
  });
  return () => listener.remove();
}
