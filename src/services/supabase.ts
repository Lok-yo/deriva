import 'react-native-url-polyfill/auto';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { createClient, processLock } from '@supabase/supabase-js';
import { captureExpectedSession, createSessionClient } from './identity';

const nativeStorage = {
  async getItem(key: string) {
    const pointer = await SecureStore.getItemAsync(`${key}.pointer`);
    if (!pointer) return null;
    const keys: string[] = JSON.parse(pointer);
    const chunks = await Promise.all(keys.map(part => SecureStore.getItemAsync(part)));
    return chunks.some(chunk => chunk == null) ? null : chunks.join('');
  },
  async setItem(key: string, value: string) {
    const previous = await SecureStore.getItemAsync(`${key}.pointer`);
    const version = Crypto.randomUUID();
    const keys = Array.from({ length: Math.ceil(value.length / 1800) }, (_, index) => `${key}.${version}.${index}`);
    await Promise.all(keys.map((part, index) => SecureStore.setItemAsync(part, value.slice(index * 1800, (index + 1) * 1800))));
    await SecureStore.setItemAsync(`${key}.pointer`, JSON.stringify(keys));
    if (previous) await Promise.all((JSON.parse(previous) as string[]).map(part => SecureStore.deleteItemAsync(part)));
  },
  async removeItem(key: string) {
    const previous = await SecureStore.getItemAsync(`${key}.pointer`);
    await SecureStore.deleteItemAsync(`${key}.pointer`);
    if (previous) await Promise.all((JSON.parse(previous) as string[]).map(part => SecureStore.deleteItemAsync(part)));
  },
};
const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
export const isConfigured = /^https:\/\//.test(url) && !!key;
export const supabase = isConfigured ? createClient(url, key, {
  auth: { storage: Platform.OS === 'web' ? AsyncStorage : nativeStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false, lock: processLock },
}) : null;

if (Platform.OS !== 'web' && supabase) {
  AppState.addEventListener('change', state => {
    if (state === 'active') supabase?.auth.startAutoRefresh();
    else supabase?.auth.stopAutoRefresh();
  });
}
export function requireSupabase() {
  if (!supabase) throw new Error('La conexión de Deriva aún no está configurada. Puedes explorar la vista previa.');
  return supabase;
}
export async function requireSessionFor(expectedUserId: string, isCurrent?: () => boolean) {
  const authClient = requireSupabase();
  const session = await captureExpectedSession(expectedUserId, async () => {
    const { data, error } = await authClient.auth.getSession();
    if (error) throw error;
    return data.session;
  }, isCurrent);
  return { ...session, client: createSessionClient(url, key, session.accessToken) };
}
export function friendlyError(error: unknown): Error {
  const message = error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String(error.message) : String(error);
  if (/Invalid login credentials/i.test(message)) return new Error('El correo o la contraseña no son correctos.');
  if (/Email not confirmed/i.test(message)) return new Error('Confirma tu correo antes de entrar. Revisa el enlace que te enviamos.');
  if (/already registered/i.test(message)) return new Error('Este correo ya tiene una cuenta. Inicia sesión.');
  if (/rate limit|too many requests|email.*limit/i.test(message)) return new Error('Has realizado varios intentos. Espera un momento y vuelve a intentar.');
  if (/network|failed to fetch|fetch failed|load failed/i.test(message)) return new Error('No pudimos conectarnos. Revisa tu conexión y vuelve a intentar.');
  if (/JWT expired|Invalid Refresh Token/i.test(message)) return new Error('Tu sesión caducó. Inicia sesión nuevamente.');
  return new Error(message || 'No se pudo completar la operación. Intenta de nuevo.');
}
