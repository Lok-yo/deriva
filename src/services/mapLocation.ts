import * as Location from 'expo-location';
import type { MapLocationResult } from '../state/mapLocationStore';

/** Browsing accepts approximate location. Publishing keeps its stricter GPS check. */
export async function readMapLocation(): Promise<MapLocationResult> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    let permission = await Location.getForegroundPermissionsAsync();
    if (permission.status !== 'granted' && permission.canAskAgain) permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') return {
      status: 'denied', canAskAgain: permission.canAskAgain,
      error: permission.canAskAgain ? 'Sin ubicación. Permite el acceso para centrar el mapa donde estás.' : 'Sin permiso de ubicación. Puedes activarlo en Ajustes.',
    };
    if (!await Location.hasServicesEnabledAsync()) return { status: 'unavailable', canAskAgain: true, error: 'La ubicación del teléfono está apagada. Actívala y vuelve a intentar.' };
    const result = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('timeout')), 20000); }),
    ]);
    const { latitude, longitude, accuracy } = result.coords;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw new Error('Invalid coordinate');
    return { position: { latitude, longitude, accuracy: accuracy != null && Number.isFinite(accuracy) ? accuracy : null, timestamp: new Date(result.timestamp).toISOString(), mocked: result.mocked ?? false } };
  } catch {
    return { status: 'error', canAskAgain: true, error: 'No encontramos tu ubicación. Acércate a una ventana o vuelve a intentar.' };
  } finally { if (timeout) clearTimeout(timeout); }
}
