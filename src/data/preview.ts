import type { Place } from '../domain/models';

const examples = [
  { title: 'Donde la ciudad se vuelve horizonte', category: 'naturaleza', latitude: 29.0726, longitude: -110.9483, photo: 'photo-1464822759023-fed622ff2c3b', author: 'Sofía' },
  { title: 'Una pausa entre los árboles', category: 'naturaleza', latitude: 29.0833, longitude: -110.9605, photo: 'photo-1448375240586-882707db888b', author: 'Mateo' },
  { title: 'La última luz del desierto', category: 'misterio', latitude: 29.0915, longitude: -110.9802, photo: 'photo-1509316785289-025f5b846b35', author: 'Valeria' },
  { title: 'La esquina que siempre pasabas de largo', category: 'urbano', latitude: 29.0782, longitude: -110.9558, photo: 'photo-1519608487953-e999c86e7455', author: 'Diego' },
  { title: 'Un sendero, ninguna prisa', category: 'naturaleza', latitude: 29.0631, longitude: -110.9352, photo: 'photo-1441974231531-c6227db76b6e', author: 'Lucía' },
  { title: 'El silencio después de la lluvia', category: 'misterio', latitude: 29.0658, longitude: -110.9734, photo: 'photo-1470770841072-f978cf4d019e', author: 'Emilio' },
] as const;

// Examples are never sent to Supabase and never represent a user's real position.
export const previewPlaces: Place[] = examples.map((example, index) => ({
  id: `demo-${index + 1}`, owner_id: 'preview', title: example.title, category: example.category,
  latitude: example.latitude, longitude: example.longitude, photo_path: '', photo_source: 'camera',
  created_at: '2026-10-02T15:00:00Z', authorName: example.author,
  photoUrl: `https://images.unsplash.com/${example.photo}?auto=format&fit=crop&w=900&q=80`,
}));
