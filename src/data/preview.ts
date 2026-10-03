import type { Place } from '../domain/models';

/** Viewing examples never supplies or replaces the phone's actual location. */
export const SLRC_CENTER = { latitude: 32.4568757, longitude: -114.7797143 };
export const isPreviewPlace = (place: Place | string) => typeof place === 'string' ? place.startsWith('demo-') : place.owner_id === 'preview';

// Representative points from OpenStreetMap park polygons; not precise entrances.
const examples = [
  { title: 'Bosque de la Ciudad', category: 'naturaleza', latitude: 32.4452716, longitude: -114.7894500, osm: 233564759, photo: 'photo-1441974231531-c6227db76b6e' },
  { title: 'Plaza Benito Juárez', category: 'urbano', latitude: 32.4800748, longitude: -114.7804175, osm: 233567470, photo: 'photo-1519608487953-e999c86e7455' },
  { title: 'Parque Solidaridad', category: 'naturaleza', latitude: 32.4525674, longitude: -114.8043819, osm: 233744892, photo: 'photo-1470770841072-f978cf4d019e' },
  { title: 'Parque La Tortuga', category: 'naturaleza', latitude: 32.4327620, longitude: -114.7571808, osm: 253208952, photo: 'photo-1509316785289-025f5b846b35' },
  { title: 'Parque Yoreme', category: 'naturaleza', latitude: 32.4634193, longitude: -114.7408790, osm: 233669476, photo: 'photo-1448375240586-882707db888b' },
  { title: 'Parque Emiliano Zapata', category: 'naturaleza', latitude: 32.4671593, longitude: -114.8019795, osm: 242092411, photo: 'photo-1464822759023-fed622ff2c3b' },
] as const;

export const previewSources = Object.fromEntries(examples.map((example, index) => [`demo-${index + 1}`, `https://www.openstreetmap.org/way/${example.osm}`]));

// Local examples are never uploaded to Supabase. Photos are explicitly illustrative.
export const previewPlaces: Place[] = examples.map((example, index) => ({
  id: `demo-${index + 1}`, owner_id: 'preview', title: example.title, category: example.category,
  latitude: example.latitude, longitude: example.longitude, photo_path: '', photo_source: 'gallery',
  created_at: '2026-10-03T15:00:00Z', authorName: 'Ejemplo local de SLRC',
  photoUrl: `https://images.unsplash.com/${example.photo}?auto=format&fit=crop&w=900&q=80`,
}));
