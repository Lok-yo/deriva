import { distanceMeters, isCoordinate } from './geo';
import type { Position, PublishDraft } from './models';

export function validatePublication(draft: PublishDraft, premium: boolean, gps: Position | null, now = Date.now()): PublishDraft {
  const title = draft.title.trim();
  if (title.length < 3 || title.length > 80) throw new Error('El título debe tener entre 3 y 80 caracteres.');
  if (!isCoordinate(draft)) throw new Error('Las coordenadas no son válidas.');
  if (!['naturaleza', 'urbano', 'misterio'].includes(draft.category)) throw new Error('Elige una categoría válida.');
  if (!draft.photo?.uri || !['camera', 'gallery'].includes(draft.photo.source)) throw new Error('Agrega una foto del lugar.');
  if (!premium && draft.photo.source !== 'camera') throw new Error('El plan gratuito requiere una foto de la cámara.');
  if (draft.photo.source === 'camera' && !draft.photo.biometricVerified) throw new Error('Confirma tu identidad con biometría antes de tomar la foto.');
  if (!premium) {
    if (!gps || !isCoordinate(gps)) throw new Error('Obtén tu ubicación con el GPS antes de publicar.');
    if (gps.mocked) throw new Error('No se permite una ubicación simulada.');
    if (!Number.isFinite(gps.accuracy) || gps.accuracy < 0 || gps.accuracy > 100) throw new Error('La precisión del GPS debe ser de 100 metros o menos. Intenta al aire libre.');
    const age = now - Date.parse(gps.timestamp);
    if (!Number.isFinite(age) || age > 120000 || age < -30000) throw new Error('La lectura del GPS caducó. Actualiza tu ubicación.');
    if (distanceMeters(gps, draft) > 100) throw new Error('Tu ubicación cambió. Actualiza el punto antes de publicar.');
  }
  return { ...draft, title };
}
