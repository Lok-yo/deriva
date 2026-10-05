import type { Place, Position, Profile, PublishDraft } from '../domain/models';
import { encodePhoto } from './photos';
import { requireSessionFor, requireSupabase } from './supabase';

export async function fetchPlaces(extraIds: string[] = []): Promise<Place[]> {
  const client = requireSupabase();
  const { data, error } = await client.from('deriva_places').select('*').order('created_at', { ascending: false }).limit(300);
  if (error) throw error;
  const rows = data ?? [];
  const missing = [...new Set(extraIds)].filter(id => !rows.some(place => place.id === id));
  for (let start = 0; start < missing.length; start += 100) {
    const additional = await client.from('deriva_places').select('*').in('id', missing.slice(start, start + 100));
    if (additional.error) throw additional.error;
    rows.push(...additional.data ?? []);
  }
  if (!rows.length) return [];
  const owners = [...new Set(rows.map(place => String(place.owner_id)))];
  const profileChunks = await Promise.all(Array.from({ length: Math.ceil(owners.length / 100) }, (_, index) => client.from('deriva_profiles').select('user_id, display_name').in('user_id', owners.slice(index * 100, index * 100 + 100))));
  const failedProfiles = profileChunks.find(result => result.error);
  if (failedProfiles?.error) throw failedProfiles.error;
  const names = new Map(profileChunks.flatMap(result => result.data ?? []).map(profile => [String(profile.user_id), String(profile.display_name)]));
  const { data: signed } = await client.storage.from('deriva-photos').createSignedUrls(rows.map(place => place.photo_path), 3600);
  // Storage can fail per file even when its batch response has no global error.
  // Keep the place visible; the photo component offers an explicit retry.
  const photos = new Map((signed ?? []).map(photo => [photo.path, photo.error ? '' : photo.signedUrl ?? '']));
  return rows.map(place => ({ ...place, photoUrl: photos.get(place.photo_path) ?? '', authorName: names.get(place.owner_id) ?? 'Explorador' }) as Place);
}

export async function fetchPlace(id: string): Promise<Place | null> {
  const client = requireSupabase();
  const { data, error } = await client.from('deriva_places').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [profile, photo] = await Promise.all([
    client.from('deriva_profiles').select('display_name').eq('user_id', data.owner_id).maybeSingle(),
    client.storage.from('deriva-photos').createSignedUrl(data.photo_path, 3600),
  ]);
  if (profile.error) throw profile.error;
  return { ...data, photoUrl: photo.error ? '' : photo.data?.signedUrl ?? '', authorName: profile.data?.display_name ?? 'Explorador' } as Place;
}

export async function ensureProfile(userId: string, name: string): Promise<Profile> {
  const client = requireSupabase();
  const existing = await client.from('deriva_profiles').select('*').eq('user_id', userId).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data as Profile;
  const displayName = name.trim().slice(0, 60) || 'Explorador';
  const created = await client.from('deriva_profiles').upsert({ user_id: userId, display_name: displayName }, { onConflict: 'user_id', ignoreDuplicates: true });
  if (created.error) throw created.error;
  const result = await client.from('deriva_profiles').select('*').eq('user_id', userId).single();
  if (result.error) throw result.error;
  return result.data as Profile;
}

export async function publishPlace(userId: string, draft: PublishDraft, gps: Position | null, isCurrent?: () => boolean): Promise<string> {
  const bound = await requireSessionFor(userId, isCurrent);
  const client = bound.client;
  const path = `${userId}/${draft.requestId}.jpg`;
  const bytes = await encodePhoto(draft.photo.uri);
  await bound.assertCurrent();
  const uploaded = await client.storage.from('deriva-photos').upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
  if (uploaded.error && !/already exists|Duplicate/i.test(uploaded.error.message)) throw uploaded.error;
  await bound.assertCurrent();
  const result = await client.rpc('deriva_create_place_v2', {
    p_request_id: draft.requestId, p_title: draft.title, p_mode: draft.mode,
    p_latitude: draft.latitude, p_longitude: draft.longitude, p_photo_path: path,
    p_photo_source: draft.photo.source, p_gps_latitude: gps?.latitude ?? null,
    p_gps_longitude: gps?.longitude ?? null, p_gps_accuracy: gps?.accuracy ?? null,
    p_gps_timestamp: gps?.timestamp ?? null, p_biometric_verified: draft.photo.biometricVerified,
  });
  if (result.error) {
    // Keep an upload on uncertain network failure: the same request UUID can safely retry.
    if (!/network|fetch|timeout/i.test(result.error.message)) await client.storage.from('deriva-photos').remove([path]);
    throw result.error;
  }
  return String(result.data);
}
