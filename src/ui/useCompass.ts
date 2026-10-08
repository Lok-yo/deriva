import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { Position } from '../domain/models';
import { getCurrentPosition, subscribeCompass, watchPosition } from '../services/sensors';
import { errorMessage } from './Feedback';

export function useCompass() {
  const [position, setPosition] = useState<Position | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stop = useRef<(() => void)[]>([]);
  const generation = useRef(0);
  const deactivate = useCallback(() => {
    generation.current += 1; stop.current.forEach(remove => remove()); stop.current = [];
    setActive(false); setHeading(null); setBusy(false);
  }, []);
  useFocusEffect(useCallback(() => {
    const listener = AppState.addEventListener('change', state => { if (state !== 'active') deactivate(); });
    return () => { listener.remove(); deactivate(); };
  }, [deactivate]));

  async function activate() {
    if (busy) return;
    deactivate(); const attempt = ++generation.current;
    setBusy(true); setError(null);
    try {
      const location = await getCurrentPosition();
      if (attempt !== generation.current) return;
      setPosition(location);
      const unsubscribe = await subscribeCompass(value => { if (attempt === generation.current) setHeading(value); });
      if (attempt !== generation.current) { unsubscribe(); return; }
      stop.current.push(unsubscribe); setActive(true);
      // Live distance is a bonus: the first reading already works if the watch cannot start.
      const unwatch = await watchPosition(next => { if (attempt === generation.current) setPosition(next); }).catch(() => null);
      if (unwatch && attempt !== generation.current) unwatch();
      else if (unwatch) stop.current.push(unwatch);
    } catch (e) { if (attempt === generation.current) setError(errorMessage(e)); }
    finally { if (attempt === generation.current) setBusy(false); }
  }
  async function refreshPosition() {
    setBusy(true); setError(null); const attempt = generation.current;
    try { const location = await getCurrentPosition(); if (attempt === generation.current) setPosition(location); }
    catch (e) { if (attempt === generation.current) setError(errorMessage(e)); }
    finally { if (attempt === generation.current) setBusy(false); }
  }
  return { position, heading, active, busy, error, activate, deactivate, refreshPosition };
}
