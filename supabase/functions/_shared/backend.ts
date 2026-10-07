import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { HttpError } from './core.ts';

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

