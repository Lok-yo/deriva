import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState as NativeAppState } from 'react-native';
import type { RealtimePostgresChangesPayload, Session } from '@supabase/supabase-js';
import type { AppNotification, ConnectionState, Place, Profile, PublicationAccess } from '../domain/models';
import type { AppState } from './contracts';
import { isPreviewPlace, previewPlaces } from '../data/preview';
import { useMapLocation } from './useMapLocation';
import { publicationAccess, resolvePublicationDraft, validatePublication } from '../domain/publication';
import { friendlyError, requireSessionFor, requireSupabase, supabase } from '../services/supabase';
import { ensureProfile, fetchPlace, fetchPlaces, hydratePlace, publishPlace } from '../services/places';
import { getCurrentPosition } from '../services/sensors';
import { canRegisterPush, registerPushToken, unregisterPushToken } from '../services/notifications';
import { openRemoteCheckout } from '../services/checkout';

const Context = createContext<AppState | null>(null);
export function useApp(): AppState {
  const context = useContext(Context);
  if (!context) throw new Error('AppProvider no está disponible.');
  return context;
}

export function AppProvider({ children }: React.PropsWithChildren) {
  const navigationLocation = useMapLocation();
  const [ready, setReady] = useState(!supabase);
  const [session, setSession] = useState<Session | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const [loadedUser, setLoadedUser] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const placesRef = useRef(places);
  useEffect(() => { placesRef.current = places; }, [places]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [access, setAccess] = useState<PublicationAccess>({ isAdmin: false, remoteCredits: 0 });
  const [connection, setConnection] = useState<ConnectionState>('preview');
  const [error, setError] = useState<string | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationRadius, setNotificationRadius] = useState(10);
  const accountSequence = useRef(0);
  const placesSequence = useRef(0);
  const placesRun = useRef<Promise<void> | null>(null);
  const placesStale = useRef(false);
  const placesLoadedAt = useRef(0);
  const realtimeConnected = useRef(false);
  const healthy = useRef({ account: false, places: false });
  const signingOutUser = useRef<string | null>(null);
  const updatingPushUser = useRef<string | null>(null);

  const acceptSession = useCallback((nextSession: Session | null) => {
    if (sessionRef.current?.user.id !== nextSession?.user.id) {
      accountSequence.current += 1; placesSequence.current += 1; placesLoadedAt.current = 0;
      setLoadedUser(null); setProfile(null); setPlaces([]); setNotifications([]);
      setAccess({ isAdmin: false, remoteCredits: 0 }); setError(null); setNotificationsEnabled(false);
      realtimeConnected.current = false; healthy.current = { account: false, places: false };
      setConnection(nextSession ? 'connecting' : 'preview');
    }
    sessionRef.current = nextSession;
    setSession(nextSession);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let disposed = false;
    void supabase.auth.getSession().then(({ data, error: authError }) => {
      if (disposed) return;
      if (authError) setError(friendlyError(authError).message);
      acceptSession(data.session);
    }).catch(authError => { if (!disposed) { setError(friendlyError(authError).message); setReady(true); } });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!disposed) acceptSession(nextSession);
    });
    return () => { disposed = true; subscription.unsubscribe(); };
  }, [acceptSession]);

  const settle = useCallback((part: 'account' | 'places', cause?: unknown) => {
    healthy.current[part] = cause === undefined;
    if (cause !== undefined) { setError(friendlyError(cause).message); setConnection('offline'); return; }
    if (healthy.current.account && healthy.current.places) { setError(null); setConnection(realtimeConnected.current ? 'live' : 'connecting'); }
  }, []);

  // Small, user-scoped queries: profile, inbox, alerts and publication access.
  const refreshAccount = useCallback(async () => {
    const user = sessionRef.current?.user;
    if (!user || !supabase) return;
    const current = ++accountSequence.current;
    try {
      const [nextProfile, inbox, preference, access] = await Promise.all([
        ensureProfile(user.id, String(user.user_metadata.full_name ?? 'Explorador')),
        supabase.from('deriva_notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(100),
        supabase.from('deriva_notification_preferences').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.rpc('deriva_get_access'),
      ]);
      for (const result of [inbox, preference, access]) if (result.error) throw result.error;
      if (current !== accountSequence.current || user.id !== sessionRef.current?.user.id) return;
      setProfile(nextProfile); setNotifications((inbox.data ?? []) as AppNotification[]);
      setAccess(publicationAccess(access.data)); setNotificationsEnabled(preference.data?.enabled === true); setNotificationRadius(preference.data?.radius_km ?? 10);
      setLoadedUser(user.id); settle('account');
    } catch (cause) {
      if (current !== accountSequence.current || user.id !== sessionRef.current?.user.id) return;
      settle('account', cause);
    }
  }, [settle]);

  const loadPlaces = useCallback(async () => {
    const user = sessionRef.current?.user;
    if (!user || !supabase) return;
    const current = ++placesSequence.current;
    try {
      const nextPlaces = await fetchPlaces();
      if (current !== placesSequence.current || user.id !== sessionRef.current?.user.id) return;
      setPlaces(nextPlaces); placesLoadedAt.current = Date.now(); settle('places');
    } catch (cause) {
      if (current !== placesSequence.current || user.id !== sessionRef.current?.user.id) return;
      settle('places', cause);
    }
  }, [settle]);

  // The full map query is the expensive one: concurrent requests share one run,
  // and a request that arrives mid-run triggers exactly one more pass.
  const refreshPlaces = useCallback((): Promise<void> => {
    if (placesRun.current) { placesStale.current = true; return placesRun.current; }
    const run = (async () => {
      try { do { placesStale.current = false; await loadPlaces(); } while (placesStale.current); }
      finally { placesRun.current = null; }
    })();
    placesRun.current = run;
    return run;
  }, [loadPlaces]);

  const refresh = useCallback(async () => { await Promise.all([refreshAccount(), refreshPlaces()]); }, [refreshAccount, refreshPlaces]);

  const upsertPlace = useCallback((place: Place) => {
    setPlaces(list => list.some(item => item.id === place.id) ? list.map(item => item.id === place.id ? place : item) : [place, ...list]);
  }, []);

  // Apply another user's change to one place instead of reloading the whole map.
  const applyPlaceChange = useCallback((payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
    if (placesRun.current) { placesStale.current = true; return; }
    if (payload.eventType === 'DELETE') {
      const id = payload.old.id;
      if (typeof id === 'string') setPlaces(list => list.filter(place => place.id !== id));
      return;
    }
    const row = payload.new as Omit<Place, 'photoUrl' | 'authorName'>;
    if (typeof row.id !== 'string') return;
    const userId = sessionRef.current?.user.id;
    const epoch = placesSequence.current;
    const knownAuthor = placesRef.current.find(place => place.owner_id === row.owner_id)?.authorName;
    void hydratePlace(row, knownAuthor).then(place => {
      if (epoch === placesSequence.current && userId === sessionRef.current?.user.id) upsertPlace(place);
    }).catch(() => { void refreshPlaces(); });
  }, [refreshPlaces, upsertPlace]);

  const applyProfileChange = useCallback((payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
    if (payload.eventType === 'DELETE') return;
    const { user_id: userId, display_name: name } = payload.new;
    if (typeof userId !== 'string' || typeof name !== 'string') return;
    setPlaces(list => list.some(place => place.owner_id === userId) ? list.map(place => place.owner_id === userId ? { ...place, authorName: name } : place) : list);
    if (userId === sessionRef.current?.user.id) setProfile(current => current ? { ...current, display_name: name } : current);
  }, []);

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId || !supabase) return;
    // The map loads once the channel is subscribed, so no change slips between both.
    void refreshAccount();
    const fallback = setTimeout(() => { if (!realtimeConnected.current) void refreshPlaces(); }, 5000);
    let accountTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleAccount = () => { clearTimeout(accountTimer); accountTimer = setTimeout(() => { void refreshAccount(); }, 250); };
    const channel = supabase.channel(`deriva:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deriva_places' }, applyPlaceChange)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'deriva_profiles' }, applyProfileChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deriva_roles', filter: `user_id=eq.${userId}` }, scheduleAccount)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deriva_remote_purchases', filter: `user_id=eq.${userId}` }, scheduleAccount)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deriva_notifications', filter: `user_id=eq.${userId}` }, scheduleAccount)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deriva_notification_preferences', filter: `user_id=eq.${userId}` }, scheduleAccount)
      .subscribe(status => {
        if (sessionRef.current?.user.id !== userId) return;
        realtimeConnected.current = status === 'SUBSCRIBED';
        // A (re)subscription may have missed events, so reconcile everything once.
        if (status === 'SUBSCRIBED') { setConnection(healthy.current.account && healthy.current.places ? 'live' : 'connecting'); void refresh(); }
        else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) { setConnection('offline'); if (!placesLoadedAt.current) void refreshPlaces(); }
      });
    const foreground = NativeAppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    // Account data is cheap to poll; the map only reloads before its signed photo URLs (1 h) expire.
    const reconcile = setInterval(() => {
      if (NativeAppState.currentState !== 'active') return;
      void refreshAccount();
      if (Date.now() - placesLoadedAt.current > 30 * 60 * 1000) void refreshPlaces();
    }, 60000);
    return () => { clearTimeout(fallback); clearTimeout(accountTimer); clearInterval(reconcile); foreground.remove(); void supabase?.removeChannel(channel); };
  }, [session?.user.id, refresh, refreshAccount, refreshPlaces, applyPlaceChange, applyProfileChange]);

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId || loadedUser !== userId || (!notificationsEnabled && !access.isAdmin) || !canRegisterPush()) return;
    let disposed = false;
    let busy = false;
    let lastSuccess = 0;
    const isCurrent = () => !disposed && sessionRef.current?.user.id === userId
      && signingOutUser.current !== userId && updatingPushUser.current !== userId;
    const reconcile = async () => {
      if (!isCurrent() || busy || Date.now() - lastSuccess < 15 * 60 * 1000) return;
      busy = true;
      try {
        // Re-register after login/token rotation using existing permission only.
        if (await registerPushToken(userId, { requestPermission: false, isCurrent })) lastSuccess = Date.now();
      } catch (cause) {
        if (isCurrent()) setError(friendlyError(cause).message);
      } finally { busy = false; }
    };
    void reconcile();
    const foreground = NativeAppState.addEventListener('change', state => { if (state === 'active') void reconcile(); });
    const retry = setInterval(() => { if (NativeAppState.currentState === 'active') void reconcile(); }, 60000);
    return () => { disposed = true; foreground.remove(); clearInterval(retry); };
  }, [session?.user.id, loadedUser, notificationsEnabled, access.isAdmin]);

  const isSameSession = (userId: string) => sessionRef.current?.user.id === userId && signingOutUser.current !== userId;
  const currentUser = () => {
    const user = sessionRef.current?.user;
    if (!user) throw new Error('Inicia sesión para continuar.');
    if (signingOutUser.current === user.id) throw new Error('Espera a que termine el cierre de sesión.');
    return user;
  };
  const belongsToSession = !!session && loadedUser === session.user.id;
  const handle = async <T,>(operation: () => Promise<T>): Promise<T> => {
    try { return await operation(); } catch (cause) { throw friendlyError(cause); }
  };
  const value: AppState = {
    ready, session, profile: belongsToSession ? profile : null, isPreview: !session,
    places: belongsToSession ? [...previewPlaces, ...places] : previewPlaces,
    notifications: belongsToSession ? notifications : [],
    isAdmin: belongsToSession && access.isAdmin, remoteCredits: belongsToSession ? access.remoteCredits : 0, connection: session ? connection : 'preview', error,
    notificationsEnabled: belongsToSession && (notificationsEnabled || access.isAdmin), notificationRadius, refresh,
    mapLocation: navigationLocation.location, startMapLocation: navigationLocation.start, locateMap: navigationLocation.locate,
    signIn: (email, password) => handle(async () => {
      const result = await requireSupabase().auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) throw result.error;
    }),
    signUp: (name, email, password) => handle(async () => {
      if (name.trim().length < 2 || name.trim().length > 60) throw new Error('Tu nombre debe tener entre 2 y 60 caracteres.');
      if (password.length < 8) throw new Error('Usa una contraseña de al menos 8 caracteres.');
      const result = await requireSupabase().auth.signUp({ email: email.trim(), password, options: { data: { full_name: name.trim() } } });
      if (result.error) throw result.error;
      return { needsEmailConfirmation: !result.data.session };
    }),
    signOut: () => handle(async () => {
      const user = currentUser();
      signingOutUser.current = user.id;
      try {
        await unregisterPushToken(user.id).catch(() => {});
        if (sessionRef.current?.user.id !== user.id) throw new Error('Tu sesión cambió mientras cerrabas la cuenta.');
        const result = await requireSupabase().auth.signOut({ scope: 'local' });
        if (result.error) throw result.error;
        if (!sessionRef.current || sessionRef.current.user.id === user.id) acceptSession(null);
      } finally { if (signingOutUser.current === user.id) signingOutUser.current = null; }
    }),
    publish: draft => handle(async () => {
      const user = currentUser();
      const bound = await requireSessionFor(user.id, () => isSameSession(user.id));
      const client = bound.client;
      const existing = await client.from('deriva_places').select('id').eq('id', draft.requestId).eq('owner_id', user.id).maybeSingle();
      if (existing.error) throw existing.error;
      await bound.assertCurrent();
      if (existing.data) { await refreshAccount(); return existing.data.id as string; }
      const gps = draft.mode === 'local' ? await getCurrentPosition() : null;
      const latestAccess = await client.rpc('deriva_get_access');
      if (latestAccess.error) throw latestAccess.error;
      if (sessionRef.current?.user.id !== user.id) throw new Error('Tu sesión cambió. Inicia la publicación de nuevo.');
      const currentDraft = resolvePublicationDraft(draft, gps);
      const validated = validatePublication(currentDraft, publicationAccess(latestAccess.data), gps);
      const id = await publishPlace(user.id, validated, gps, () => isSameSession(user.id));
      const [place] = await Promise.all([fetchPlace(id), refreshAccount()]);
      if (place && isSameSession(user.id)) upsertPlace(place);
      return id;
    }),
    deletePlace: id => handle(async () => {
      if (isPreviewPlace(id)) throw new Error('Los ejemplos locales no son publicaciones de tu cuenta.');
      const user = currentUser(); const client = requireSupabase();
      const removed = await client.from('deriva_places').delete().eq('id', id).eq('owner_id', user.id).select('photo_path').single();
      if (removed.error) throw removed.error;
      await client.storage.from('deriva-photos').remove([removed.data.photo_path]);
      setPlaces(list => list.filter(place => place.id !== id));
    }),
    markNotificationRead: id => handle(async () => {
      const user = currentUser();
      const readAt = new Date().toISOString();
      const result = await requireSupabase().from('deriva_notifications').update({ read_at: readAt }).eq('id', id).eq('user_id', user.id);
      if (result.error) throw result.error;
      if (isSameSession(user.id)) setNotifications(list => list.map(item => item.id === id ? { ...item, read_at: readAt } : item));
    }),
    setNotificationPreferences: (enabled, radiusKm) => handle(async () => {
      const user = currentUser();
      if (!Number.isFinite(radiusKm) || radiusKm < 1 || radiusKm > 50) throw new Error('El radio debe estar entre 1 y 50 km.');
      if (updatingPushUser.current === user.id) throw new Error('Espera a que termine la actualización de tus alertas.');
      updatingPushUser.current = user.id;
      try {
        const bound = await requireSessionFor(user.id, () => isSameSession(user.id));
        const client = bound.client;
        if (enabled) {
          const position = await getCurrentPosition();
          await bound.assertCurrent();
          await registerPushToken(user.id, { isCurrent: () => isSameSession(user.id) });
          await bound.assertCurrent();
          const values = { enabled: true, latitude: position.latitude, longitude: position.longitude, radius_km: radiusKm };
          const existing = await client.from('deriva_notification_preferences').select('user_id').eq('user_id', user.id).maybeSingle();
          if (existing.error) throw existing.error;
          await bound.assertCurrent();
          let result = existing.data ? await client.from('deriva_notification_preferences').update(values).eq('user_id', user.id) : await client.from('deriva_notification_preferences').insert({ user_id: user.id, ...values });
          if (result.error?.code === '23505') result = await client.from('deriva_notification_preferences').update(values).eq('user_id', user.id);
          if (result.error) throw result.error;
        } else {
          const result = await client.from('deriva_notification_preferences').update({ enabled: false }).eq('user_id', user.id);
          if (result.error) throw result.error;
          await bound.assertCurrent();
          await unregisterPushToken(user.id);
        }
        await bound.assertCurrent();
        await refreshAccount();
      } finally { if (updatingPushUser.current === user.id) updatingPushUser.current = null; }
    }),
    openRemoteCheckout: requestId => handle(async () => {
      const user = currentUser();
      try { await openRemoteCheckout(user.id, requestId, () => isSameSession(user.id)); }
      finally { if (isSameSession(user.id)) await refreshAccount(); }
    }),
    updateDisplayName: name => handle(async () => {
      const user = currentUser();
      if (name.trim().length < 2 || name.trim().length > 60) throw new Error('Tu nombre debe tener entre 2 y 60 caracteres.');
      const result = await requireSupabase().from('deriva_profiles').update({ display_name: name.trim() }).eq('user_id', user.id);
      if (result.error) throw result.error;
      await refreshAccount();
    }),
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
