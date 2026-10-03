import type { MapPosition } from '../domain/models';

export type MapLocationState = {
  status: 'idle' | 'locating' | 'ready' | 'denied' | 'unavailable' | 'error';
  position: MapPosition | null;
  error: string | null;
  canAskAgain: boolean;
};

export type MapLocationResult =
  | { position: MapPosition }
  | { status: 'denied' | 'unavailable' | 'error'; error: string; canAskAgain: boolean };

/** One automatic request per app session; an explicit retry may request again. */
export function createMapLocationStore(readPosition: () => Promise<MapLocationResult>) {
  let state: MapLocationState = { status: 'idle', position: null, error: null, canAskAgain: true };
  let started = false;
  let pending: Promise<MapLocationState> | null = null;
  const listeners = new Set<() => void>();
  const update = (next: MapLocationState) => { state = next; listeners.forEach(listener => listener()); };
  const locate = (): Promise<MapLocationState> => {
    if (pending) return pending;
    started = true;
    update({ ...state, status: 'locating', error: null });
    pending = (async () => {
      try {
        const result = await Promise.resolve().then(readPosition);
        update('position' in result
          ? { status: 'ready', position: result.position, error: null, canAskAgain: true }
          : { ...result, position: null });
      } catch {
        update({ status: 'error', position: null, error: 'No pudimos obtener tu ubicación. Puedes seguir explorando y volver a intentarlo.', canAskAgain: true });
      } finally { pending = null; }
      return state;
    })();
    return pending;
  };
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    start: () => started ? pending ?? Promise.resolve(state) : locate(),
    locate,
  };
}
