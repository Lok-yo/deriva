export type DiscoveryStorage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> };

const key = 'deriva.discovered.v1';
const empty: ReadonlySet<string> = new Set();

/** Places this device has opened. Kept only on the phone; it never reaches the server. */
export function createDiscoveryStore(storage: DiscoveryStorage) {
  let state = empty;
  let loaded: Promise<void> | null = null;
  const listeners = new Set<() => void>();
  const update = (next: ReadonlySet<string>) => { state = next; listeners.forEach(listener => listener()); };
  const load = () => loaded ??= storage.getItem(key).then(raw => {
    const saved: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(saved)) update(new Set([...saved.filter((id): id is string => typeof id === 'string'), ...state]));
  }).catch(() => {});
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); void load(); return () => { listeners.delete(listener); }; },
    async discover(id: string) {
      await load();
      if (state.has(id)) return;
      update(new Set([...state, id]));
      await storage.setItem(key, JSON.stringify([...state])).catch(() => {});
    },
  };
}
