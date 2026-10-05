import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState as NativeAppState } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import type { AppNotification, ConnectionState, Place, Profile, PublicationAccess } from '../domain/models';
import type { AppState } from './contracts';
import { isPreviewPlace, previewPlaces } from '../data/preview';
import { useMapLocation } from './useMapLocation';
import { publicationAccess, resolvePublicationDraft, validatePublication } from '../domain/publication';
import { friendlyError, requireSessionFor, requireSupabase, supabase } from '../services/supabase';
import { ensureProfile, fetchPlaces, publishPlace } from '../services/places';
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
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [access, setAccess] = useState<PublicationAccess>({ isAdmin: false, remoteCredits: 0 });
  const [connection, setConnection] = useState<ConnectionState>('preview');
  const [error, setError] = useState<string | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationRadius, setNotificationRadius] = useState(10);
  const sequence = useRef(0);
  const realtimeConnected = useRef(false);
  const dataHealthy = useRef(false);
  const signingOutUser = useRef<string | null>(null);
  const updatingPushUser = useRef<string | null>(null);

  const acceptSession = useCallback((nextSession: Session | null) => {
    if (sessionRef.current?.user.id !== nextSession?.user.id) {
      sequence.current += 1;
      setLoadedUser(null); setProfile(null); setPlaces([]); setSavedIds([]); setNotifications([]);
      setAccess({ isAdmin: false, remoteCredits: 0 }); setError(null); setNotificationsEnabled(false);
      realtimeConnected.current = false; dataHealthy.current = false;
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

  const refresh = useCallback(async () => {
    const user = sessionRef.current?.user;
    if (!user || !supabase) return;
    const current = ++sequence.current;
    try {
      const [nextProfile, saved, inbox, preference, access] = await Promise.all([
        ensureProfile(user.id, String(user.user_metadata.full_name ?? 'Explorador')),
        supabase.from('deriva_saved_places').select('place_id').eq('user_id', user.id),
        supabase.from('deriva_notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(100),
        supabase.from('deriva_notification_preferences').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.rpc('deriva_get_access'),
      ]);
      for (const result of [saved, inbox, preference, access]) if (result.error) throw result.error;
      const nextIds = (saved.data ?? []).map(item => String(item.place_id));
      const nextNotifications = (inbox.data ?? []) as AppNotification[];
      const nextPlaces = await fetchPlaces([...nextIds, ...nextNotifications.flatMap(item => item.place_id ? [item.place_id] : [])]);
      if (current !== sequence.current || user.id !== sessionRef.current?.user.id) return;
      setProfile(nextProfile); setPlaces(nextPlaces); setSavedIds(nextIds); setNotifications(nextNotifications);
      setAccess(publicationAccess(access.data)); setNotificationsEnabled(preference.data?.enabled === true); setNotificationRadius(preference.data?.radius_km ?? 10);
      setLoadedUser(user.id); setError(null); dataHealthy.current = true;
      setConnection(realtimeConnected.current ? 'live' : 'connecting');
    } catch (cause) {
      if (current !== sequence.current || user.id !== sessionRef.current?.user.id) return;
      dataHealthy.current = false; setError(friendlyError(cause).message); setConnection('offline');
    }
  }, []);

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId || !supabase) return;
    void refresh();
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleRefresh = () => { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => { void refresh(); }, 250); };
    const channel = supabase.channel(`deriva:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deriva_places' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deriva_profiles' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deriva_roles', filter: `user_id=eq.${userId}` }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deriva_remote_purchases', filter: `user_id=eq.${userId}` }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deriva_saved_places', filter: `user_id=eq.${userId}` }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deriva_notifications', filter: `user_id=eq.${userId}` }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deriva_notification_preferences', filter: `user_id=eq.${userId}` }, scheduleRefresh)
      .subscribe(status => {
        if (sessionRef.current?.user.id !== userId) return;
        realtimeConnected.current = status === 'SUBSCRIBED';
        if (status === 'SUBSCRIBED') { setConnection(dataHealthy.current ? 'live' : 'connecting'); scheduleRefresh(); }
        else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) setConnection('offline');
      });
    const foreground = NativeAppState.addEventListener('change', state => { if (state === 'active') scheduleRefresh(); });
    // Refresh signed photo URLs and reconcile changes after a dropped channel.
    const reconcile = setInterval(() => { if (NativeAppState.currentState === 'active') void refresh(); }, 60000);
    return () => { clearTimeout(refreshTimer); clearInterval(reconcile); foreground.remove(); void supabase?.removeChannel(channel); };
  }, [session?.user.id, refresh]);

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
    savedIds: belongsToSession ? savedIds : [], notifications: belongsToSession ? notifications : [],
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
    toggleSaved: id => handle(async () => {
      if (isPreviewPlace(id)) throw new Error('Este lugar es un ejemplo local y no se puede guardar en tu cuenta.');
      const user = currentUser(); const client = requireSupabase();
      const result = savedIds.includes(id) ? await client.from('deriva_saved_places').delete().eq('user_id', user.id).eq('place_id', id) : await client.from('deriva_saved_places').upsert({ user_id: user.id, place_id: id }, { onConflict: 'user_id,place_id', ignoreDuplicates: true });
      if (result.error) throw result.error;
      await refresh();
    }),
    publish: draft => handle(async () => {
      const user = currentUser();
      const bound = await requireSessionFor(user.id, () => isSameSession(user.id));
      const client = bound.client;
      const existing = await client.from('deriva_places').select('id').eq('id', draft.requestId).eq('owner_id', user.id).maybeSingle();
      if (existing.error) throw existing.error;
      await bound.assertCurrent();
      if (existing.data) { await refresh(); return existing.data.id as string; }
      const gps = draft.mode === 'local' ? await getCurrentPosition() : null;
      const latestAccess = await client.rpc('deriva_get_access');
      if (latestAccess.error) throw latestAccess.error;
      if (sessionRef.current?.user.id !== user.id) throw new Error('Tu sesión cambió. Inicia la publicación de nuevo.');
      const currentDraft = resolvePublicationDraft(draft, gps);
      const validated = validatePublication(currentDraft, publicationAccess(latestAccess.data), gps);
      const id = await publishPlace(user.id, validated, gps, () => isSameSession(user.id));
      await refresh();
      return id;
    }),
    deletePlace: id => handle(async () => {
      if (isPreviewPlace(id)) throw new Error('Los ejemplos locales no son publicaciones de tu cuenta.');
      const user = currentUser(); const client = requireSupabase();
      const removed = await client.from('deriva_places').delete().eq('id', id).eq('owner_id', user.id).select('photo_path').single();
      if (removed.error) throw removed.error;
      await client.storage.from('deriva-photos').remove([removed.data.photo_path]);
      await refresh();
    }),
    markNotificationRead: id => handle(async () => {
      const user = currentUser();
      const result = await requireSupabase().from('deriva_notifications').update({ read_at: new Date().toISOString() }).eq('id', id).eq('user_id', user.id);
      if (result.error) throw result.error;
      await refresh();
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
        await refresh();
      } finally { if (updatingPushUser.current === user.id) updatingPushUser.current = null; }
    }),
    openRemoteCheckout: requestId => handle(async () => {
      const user = currentUser();
      try { await openRemoteCheckout(user.id, requestId, () => isSameSession(user.id)); }
      finally { if (isSameSession(user.id)) await refresh(); }
    }),
    updateDisplayName: name => handle(async () => {
      const user = currentUser();
      if (name.trim().length < 2 || name.trim().length > 60) throw new Error('Tu nombre debe tener entre 2 y 60 caracteres.');
      const result = await requireSupabase().from('deriva_profiles').update({ display_name: name.trim() }).eq('user_id', user.id);
      if (result.error) throw result.error;
      await refresh();
    }),
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
