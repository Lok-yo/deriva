import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { EntitlementSnapshot, HttpError } from './core.ts';

export function createServiceClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
    Deno.env.get('SUPABASE_SECRET_KEY');
  if (!url || !serviceKey) {
    throw new HttpError(
      503,
      'backend_not_configured',
      'El servicio todavía no está configurado.',
    );
  }
  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, options = {}) =>
        fetch(input, {
          ...options,
          signal: options.signal
            ? AbortSignal.any([options.signal, AbortSignal.timeout(8000)])
            : AbortSignal.timeout(8000),
        }),
    },
  });
}

export type ServiceClient = ReturnType<typeof createServiceClient>;

export async function syncEntitlement(
  client: ServiceClient,
  userId: string,
  snapshot: EntitlementSnapshot,
  verifiedAt: string,
) {
  const { error } = await client.rpc('deriva_sync_entitlement', {
    p_user_id: userId,
    p_active: snapshot.active,
    p_expires_at: snapshot.expiresAt,
    p_verified_at: verifiedAt,
  });
  if (error) {
    throw new HttpError(
      503,
      'billing_sync_unavailable',
      'No se pudo guardar la verificación de tu compra. Intenta de nuevo.',
    );
  }
}

export async function storedEntitlement(client: ServiceClient, userId: string) {
  const { data, error } = await client.from('deriva_entitlements')
    .select('active,expires_at,verified_at').eq('user_id', userId)
    .maybeSingle();
  if (error) {
    throw new HttpError(
      503,
      'billing_state_unavailable',
      'No se pudo consultar el estado de tu compra.',
    );
  }
  const expiration = typeof data?.expires_at === 'string'
    ? data.expires_at
    : null;
  const verifiedAt = typeof data?.verified_at === 'string'
    ? data.verified_at
    : null;
  const premium = data?.active === true && Boolean(verifiedAt) &&
    (expiration === null || Date.parse(expiration) > Date.now());
  return { premium, active: premium, expiresAt: expiration, verifiedAt };
}
