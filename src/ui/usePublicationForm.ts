import * as Crypto from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import type { Coordinate, Photo, Position } from '../domain/models';
import { publicationTarget } from '../domain/publication';
import { capturePhoto, pickGalleryPhoto } from '../services/photos';
import { getCurrentPosition } from '../services/sensors';
import { useApp } from '../state/AppProvider';
import { errorMessage } from './Feedback';

export function usePublicationForm() {
  const app = useApp();
  const params = useLocalSearchParams<{ mode?: string; latitude?: string; longitude?: string }>();
  const target = publicationTarget(params);
  const mode = target.mode;
  const [title, updateTitle] = useState('');
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [coordinate, updateCoordinate] = useState<Coordinate | null>(target.coordinate);
  const [busy, setBusy] = useState<'camera' | 'gallery' | 'gps' | 'publish' | 'checkout' | 'refresh' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkoutStarted, setCheckoutStarted] = useState(false);
  const requestId = useRef<string | null>(null);
  const checkoutRequest = useRef<string | null>(null);
  const working = useRef(false);
  const active = useRef(true);
  const isRemote = mode === 'remote';
  const needsPayment = isRemote && !app.isAdmin && app.remoteCredits < 1;

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  function setTitle(value: string) { if (value !== title) requestId.current = null; updateTitle(value); }
  function setCoordinate(value: Coordinate | null) {
    if (value?.latitude !== coordinate?.latitude || value?.longitude !== coordinate?.longitude) requestId.current = null;
    updateCoordinate(value);
  }
  function signIn() {
    router.push({ pathname: '/auth', params: { returnTo: 'publish', mode, ...(coordinate ? { latitude: String(coordinate.latitude), longitude: String(coordinate.longitude) } : {}) } });
  }
  async function run(kind: NonNullable<typeof busy>, action: () => Promise<void>) {
    if (working.current) return;
    working.current = true; setBusy(kind); setError(null);
    try { await action(); }
    catch (cause) { if (active.current) setError(errorMessage(cause)); }
    finally { working.current = false; if (active.current) setBusy(null); }
  }
  async function locate() {
    await run('gps', async () => {
      const location = await getCurrentPosition();
      if (!active.current) return;
      setPosition(location); setCoordinate(location);
    });
  }
  async function camera() {
    await run('camera', async () => {
      const result = await capturePhoto();
      if (!result || !active.current) return;
      requestId.current = null; setPhoto(result);
      if (!isRemote) {
        const location = await getCurrentPosition();
        if (!active.current) return;
        setPosition(location); setCoordinate(location);
      }
    });
  }
  async function gallery() {
    if (!isRemote) return;
    await run('gallery', async () => {
      const result = await pickGalleryPhoto();
      if (result && active.current) { requestId.current = null; setPhoto(result); }
    });
  }
  async function checkout() {
    if (!app.session) { signIn(); return; }
    if (!coordinate) { setError('Elige un punto en el mapa antes de pagar.'); return; }
    await run('checkout', async () => {
      checkoutRequest.current ??= Crypto.randomUUID();
      await app.openRemoteCheckout(checkoutRequest.current);
      if (active.current) setCheckoutStarted(true);
    });
  }
  async function refreshPayment() { await run('refresh', app.refresh); }
  async function publish() {
    if (working.current) return;
    setError(null);
    if (!app.session || app.isPreview) { signIn(); return; }
    if (title.trim().length < 3 || title.trim().length > 80) { setError('Escribe un título de entre 3 y 80 caracteres.'); return; }
    if (!photo) { setError('Añade una fotografía antes de publicar.'); return; }
    if (isRemote && !coordinate) { setError('Elige un punto en el mapa para publicar.'); return; }
    if (needsPayment) { setError('Para agregar esta ubicación, paga 1 USD.'); return; }
    await run('publish', async () => {
      requestId.current ??= Crypto.randomUUID();
      // Local publication resolves a fresh GPS point in AppProvider, even if the earlier reading failed.
      const id = await app.publish({ requestId: requestId.current, title: title.trim(), mode, photo, ...(coordinate ?? {}) });
      if (!active.current) return;
      requestId.current = null; checkoutRequest.current = null;
      setPhoto(null); updateTitle(''); setCoordinate(null); setPosition(null); setCheckoutStarted(false);
      router.setParams({ mode: 'local', latitude: '', longitude: '' });
      router.push({ pathname: '/place/[id]', params: { id, published: '1' } });
    });
  }
  function useLocalMode() { if (!working.current) { setPhoto(null); router.setParams({ mode: 'local', latitude: '', longitude: '' }); } }
  return { title, setTitle, photo, position, coordinate, setCoordinate, mode, isRemote, needsPayment, checkoutStarted, busy, error, locate, camera, gallery, publish, checkout, refreshPayment, signIn, useLocalMode };
}
