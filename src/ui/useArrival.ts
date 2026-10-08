import { useEffect, useMemo, useRef, useState } from 'react';
import { arrivalCandidate, arrivalReading } from '../domain/exploration';
import type { MapPosition, Place, Position, VisitResult } from '../domain/models';
import { useApp } from '../state/AppProvider';

export type Arrival = { place: Place; result: VisitResult };
const RETRY_MS = 20000;

/** Records a visit as soon as a precise reading lands within the arrival radius of a pending place. */
export function useArrival(position: MapPosition | Position | null, places?: Place[]) {
  const app = useApp();
  const [arrival, setArrival] = useState<Arrival | null>(null);
  const lastTry = useRef(new Map<string, number>());
  const reading = useMemo(() => arrivalReading(position), [position]);
  const place = (app.session ? arrivalCandidate(places ?? app.places, reading, app.visitedIds, app.session.user.id) : null)?.place ?? null;
  const { recordVisit } = app;
  useEffect(() => {
    if (!place || !reading) return;
    const now = Date.now();
    if (now - (lastTry.current.get(place.id) ?? 0) < RETRY_MS) return;
    lastTry.current.set(place.id, now);
    // Failures stay quiet: the next reading retries, and the place screen offers an explicit check-in.
    recordVisit(place.id, reading).then(result => { if (result.recorded) setArrival({ place, result }); }).catch(() => {});
  }, [place, reading, recordVisit]);
  return { arrival, announce: setArrival, dismiss: () => setArrival(null) };
}
