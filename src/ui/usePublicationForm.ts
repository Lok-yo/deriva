import * as Crypto from 'expo-crypto';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import type { Category, Coordinate, Photo, Position } from '../domain/models';
import { capturePhoto, pickGalleryPhoto } from '../services/photos';
import { getCurrentPosition } from '../services/sensors';
import { useApp } from '../state/AppProvider';
import { errorMessage } from './Feedback';

export function usePublicationForm() {
  const app = useApp();
  const [title, updateTitle] = useState('');
  const [category, updateCategory] = useState<Category>('naturaleza');
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [coordinate, updateCoordinate] = useState<Coordinate | null>(null);
  const [busy, setBusy] = useState<'camera' | 'gallery' | 'gps' | 'publish' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef<string | null>(null);
  function setTitle(value: string) { if (value !== title) requestId.current = null; updateTitle(value); }
  function setCategory(value: Category) { if (value !== category) requestId.current = null; updateCategory(value); }
  function setCoordinate(value: Coordinate | null) {
    if (value?.latitude !== coordinate?.latitude || value?.longitude !== coordinate?.longitude) requestId.current = null;
    updateCoordinate(value);
  }

  async function locate() {
    setBusy('gps'); setError(null);
    try { const location = await getCurrentPosition(); setPosition(location); setCoordinate(location); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(null); }
  }
  async function camera() {
    setBusy('camera'); setError(null);
    try {
      const result = await capturePhoto();
      if (result) {
        requestId.current = null;
        setPhoto(result);
        if (!app.premium) { const location = await getCurrentPosition(); setPosition(location); setCoordinate(location); }
      }
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(null); }
  }
  async function gallery() {
    if (!app.premium) { router.push('/premium'); return; }
    setBusy('gallery'); setError(null);
    try { const result = await pickGalleryPhoto(); if (result) { requestId.current = null; setPhoto(result); } }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(null); }
  }
  async function publish() {
    setError(null);
    if (!app.session || app.isPreview) { router.push('/auth'); return; }
    if (title.trim().length < 3) { setError('Escribe un título de al menos 3 caracteres.'); return; }
    if (!photo) { setError('Añade una fotografía antes de publicar.'); return; }
    if (!coordinate) { setError(app.premium ? 'Elige un punto en el mapa o usa tu ubicación.' : 'Activa el GPS para publicar desde donde estás.'); return; }
    setBusy('publish');
    try {
      requestId.current ??= Crypto.randomUUID();
      const id = await app.publish({ requestId: requestId.current, title: title.trim(), category, photo, latitude: coordinate.latitude, longitude: coordinate.longitude });
      requestId.current = null;
      setPhoto(null); setTitle(''); setCoordinate(null); setPosition(null);
      router.push({ pathname: '/place/[id]', params: { id, published: '1' } });
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(null); }
  }
  return { title, setTitle, category, setCategory, photo, position, coordinate, setCoordinate, busy, error, setError, locate, camera, gallery, publish };
}
