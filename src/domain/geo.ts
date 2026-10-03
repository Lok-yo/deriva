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
