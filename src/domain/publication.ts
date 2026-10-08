import { REQUIRED_VISITS, remoteUnlocked } from './exploration';
import { distanceMeters, isCoordinate } from './geo';
import type { Coordinate, Position, PublicationAccess, PublicationInput, PublishDraft } from './models';

export function resolvePublicationDraft(input: PublicationInput, gps: Position | null): PublishDraft {
  if (input.mode === 'local') {
    if (!gps) throw new Error('Activa el GPS para publicar desde donde estás.');
    return { ...input, latitude: gps.latitude, longitude: gps.longitude };
  }
  if (typeof input.latitude !== 'number' || typeof input.longitude !== 'number' || !isCoordinate({ latitude: input.latitude, longitude: input.longitude })) throw new Error('Elige un punto en el mapa para publicar.');
  return { ...input, latitude: input.latitude, longitude: input.longitude };
}

export function validatePublication(draft: PublishDraft, access: PublicationAccess, gps: Position | null, now = Date.now()): PublishDraft {
  const title = draft.title.trim();
  if (title.length < 3 || title.length > 80) throw new Error('El título debe tener entre 3 y 80 caracteres.');
  if (!isCoordinate(draft)) throw new Error('Las coordenadas no son válidas.');
  if (!['local', 'remote'].includes(draft.mode)) throw new Error('Elige cómo publicar el lugar.');
  if (!draft.photo?.uri || !['camera', 'gallery'].includes(draft.photo.source)) throw new Error('Agrega una foto del lugar.');
  if (draft.mode === 'remote' && !remoteUnlocked(access)) throw new Error(`Visita ${access.requiredVisits} lugares para desbloquear las ubicaciones en cualquier punto. Llevas ${access.visits}/${access.requiredVisits}.`);
  if (draft.mode === 'remote' && !access.isAdmin && access.remoteCredits < 1) throw new Error('Para agregar una ubicación en otro lugar, paga 1 USD.');
  if (draft.mode === 'local' && draft.photo.source !== 'camera') throw new Error('Publicar gratis desde aquí requiere una foto de la cámara.');
  if (draft.photo.source === 'camera' && !draft.photo.biometricVerified) throw new Error('Confirma tu identidad con biometría antes de tomar la foto.');
  if (draft.mode === 'local') {
    if (!gps || !isCoordinate(gps)) throw new Error('Obtén tu ubicación con el GPS antes de publicar.');
    if (gps.mocked) throw new Error('No se permite una ubicación simulada.');
    if (!Number.isFinite(gps.accuracy) || gps.accuracy < 0 || gps.accuracy > 100) throw new Error('La precisión del GPS debe ser de 100 metros o menos. Intenta al aire libre.');
    const age = now - Date.parse(gps.timestamp);
    if (!Number.isFinite(age) || age > 120000 || age < -30000) throw new Error('La lectura del GPS caducó. Actualiza tu ubicación.');
    if (distanceMeters(gps, draft) > 100) throw new Error('Tu ubicación cambió. Actualiza el punto antes de publicar.');
  }
  return { ...draft, title };
}

export function publicationAccess(value: unknown): PublicationAccess {
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const count = (raw: unknown) => typeof raw === 'number' && Number.isSafeInteger(raw) && raw > 0 ? raw : 0;
  return { isAdmin: data.is_admin === true, remoteCredits: count(data.remote_credits), visits: count(data.visits), requiredVisits: count(data.required_visits) || REQUIRED_VISITS };
}

export function publicationTarget(params: { mode?: string | string[]; latitude?: string | string[]; longitude?: string | string[] }): { mode: PublishDraft['mode']; coordinate: Coordinate | null } {
  if (params.mode !== 'remote') return { mode: 'local', coordinate: null };
  if (typeof params.latitude !== 'string' || typeof params.longitude !== 'string' || !params.latitude.trim() || !params.longitude.trim()) return { mode: 'remote', coordinate: null };
  const coordinate = { latitude: Number(params.latitude), longitude: Number(params.longitude) };
  return { mode: 'remote', coordinate: isCoordinate(coordinate) ? coordinate : null };
}
