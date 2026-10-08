import { rankNearby, type NearbyPlace } from './geo';
import type { MapPosition, Place, Position, PublicationAccess, VisitResult } from './models';

/** Must match deriva_private.required_visits() and deriva_private.arrival_radius_meters(). */
export const REQUIRED_VISITS = 3;
export const ARRIVAL_RADIUS_M = 100;
const MAX_ACCURACY_M = 100;
const MAX_AGE_MS = 120000;

export const remoteUnlocked = (access: PublicationAccess) => access.isAdmin || access.visits >= access.requiredVisits;
export const visitsLeft = (access: PublicationAccess) => Math.max(0, access.requiredVisits - access.visits);
/** Own publications are visible on the map but never count as a visit. */
export const countsAsVisit = (place: Place, userId: string | null | undefined) => place.owner_id !== userId;

/** The server only accepts a real, precise and recent reading; anything else is ignored here too. */
export function arrivalReading(position: MapPosition | Position | null, now = Date.now()): Position | null {
  if (!position || position.mocked || position.accuracy == null || !Number.isFinite(position.accuracy)) return null;
  if (position.accuracy < 0 || position.accuracy > MAX_ACCURACY_M) return null;
  const age = now - Date.parse(position.timestamp);
  if (!Number.isFinite(age) || age > MAX_AGE_MS || age < -30000) return null;
  return { latitude: position.latitude, longitude: position.longitude, accuracy: position.accuracy, timestamp: position.timestamp, mocked: false };
}

/** Nearest place that this reading would turn into a new visit. */
export function arrivalCandidate(places: Place[], reading: Position | null, visited: ReadonlySet<string>, userId: string | null | undefined): NearbyPlace | null {
  if (!reading || !userId) return null;
  const pending = places.filter(place => countsAsVisit(place, userId) && !visited.has(place.id));
  return rankNearby(pending, reading).find(item => item.distance! <= ARRIVAL_RADIUS_M) ?? null;
}

export function visitResult(value: unknown): VisitResult {
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const count = (raw: unknown, fallback: number) => typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 0 ? raw : fallback;
  return {
    recorded: data.recorded === true,
    visits: count(data.visits, 0),
    requiredVisits: count(data.required_visits, REQUIRED_VISITS),
    unlocked: data.unlocked === true,
    justUnlocked: data.just_unlocked === true,
  };
}
