import type { Coordinate, Place } from './models';

const radians = (value: number) => value * Math.PI / 180;
export const normalizeHeading = (value: number) => ((value % 360) + 360) % 360;
export function distanceMeters(a: Coordinate, b: Coordinate): number {
  const dLat = radians(b.latitude - a.latitude);
  const dLon = radians(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
export function bearingDegrees(a: Coordinate, b: Coordinate): number {
  const dLon = radians(b.longitude - a.longitude);
  const y = Math.sin(dLon) * Math.cos(radians(b.latitude));
  const x = Math.cos(radians(a.latitude)) * Math.sin(radians(b.latitude)) - Math.sin(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.cos(dLon);
  return normalizeHeading(Math.atan2(y, x) * 180 / Math.PI);
}
export const relativeHeading = (target: number, heading: number) => ((target - heading + 540) % 360) - 180;
export function headingFromMagnetometer(x: number, y: number): number | null {
  if (!Number.isFinite(x) || !Number.isFinite(y) || Math.hypot(x, y) < 0.1) return null;
  return normalizeHeading(Math.atan2(-x, y) * 180 / Math.PI);
}
export const formatDistance = (meters: number) => meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
export function chooseRandomPlace(places: Place[], origin: Coordinate | null, radiusKm: number, random: () => number = Math.random): Place | null {
  const candidates = origin ? places.filter(place => distanceMeters(origin, place) <= radiusKm * 1000) : places;
  if (!candidates.length) return null;
  const index = Math.min(candidates.length - 1, Math.max(0, Math.floor(random() * candidates.length)));
  return candidates[index];
}
export function isCoordinate(value: Coordinate): boolean {
  return Number.isFinite(value.latitude) && Math.abs(value.latitude) <= 90 && Number.isFinite(value.longitude) && Math.abs(value.longitude) <= 180;
}
const directions = ['norte', 'noreste', 'este', 'sureste', 'sur', 'suroeste', 'oeste', 'noroeste'] as const;
export const cardinalDirection = (bearing: number) => directions[Math.round(normalizeHeading(bearing) / 45) % 8];
export type NearbyPlace = { place: Place; distance: number | null; bearing: number | null };
/** Nearest first when there is an origin; otherwise keeps the incoming order. */
export function rankNearby(places: Place[], origin: Coordinate | null): NearbyPlace[] {
  const ranked = places.map(place => ({ place, distance: origin ? distanceMeters(origin, place) : null, bearing: origin ? bearingDegrees(origin, place) : null }));
  return origin ? ranked.sort((a, b) => a.distance! - b.distance!) : ranked;
}
export const describeHeading = (item: NearbyPlace) => item.distance == null || item.bearing == null ? null : `${formatDistance(item.distance)} al ${cardinalDirection(item.bearing)}`;
/** Drift prefers places not yet discovered, then nearby ones, and never repeats the current one when there is another. */
export function chooseDrift(places: Place[], origin: Coordinate | null, discovered: ReadonlySet<string>, currentId: string | null, radiusKm = 10, random: () => number = Math.random): Place | null {
  const others = places.filter(place => place.id !== currentId);
  const pool = others.length ? others : places;
  const fresh = pool.filter(place => !discovered.has(place.id));
  const candidates = fresh.length ? fresh : pool;
  return chooseRandomPlace(candidates, origin, radiusKm, random) ?? chooseRandomPlace(candidates, null, radiusKm, random);
}
export function nextDiscovery(places: Place[], from: Coordinate, discovered: ReadonlySet<string>, currentId: string): NearbyPlace | null {
  const ranked = rankNearby(places.filter(place => place.id !== currentId), from);
  return ranked.find(item => !discovered.has(item.place.id)) ?? null;
}
