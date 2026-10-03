import {
  HttpError,
  inactiveEntitlement,
  isUuid,
  parseRevenueCatEntitlement,
} from './core.ts';
import { fetchJson } from './http.ts';

export async function queryRevenueCat(
  userId: string,
  secret: string,
  fetcher: typeof fetch = fetch,
  clock: () => number = Date.now,
) {
  if (!secret) {
    throw new HttpError(
      503,
      'billing_not_configured',
      'Los pagos todavía no están configurados.',
    );
  }
  if (!isUuid(userId)) {
    throw new HttpError(
      400,
      'invalid_user',
      'La cuenta no tiene un identificador válido.',
    );
  }
  // The database uses this timestamp to reject slow snapshots overtaken by another request.
  const observedAt = new Date(clock()).toISOString();
  try {
    const result = await fetchJson(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${secret}`,
          Accept: 'application/json',
        },
      },
      fetcher,
    );
    if (result.status === 404) {
      return { snapshot: inactiveEntitlement(), observedAt };
    }
    if (!result.ok) {
      throw new HttpError(
        503,
        'billing_provider_unavailable',
        'No se pudo verificar tu compra con el proveedor. Intenta de nuevo.',
      );
    }
    return {
      snapshot: parseRevenueCatEntitlement(result.payload, clock()),
      observedAt,
    };
  } catch (error) {
    if (error instanceof HttpError && error.status === 503) throw error;
    throw new HttpError(
      503,
      'billing_provider_unavailable',
      'No se pudo verificar tu compra con el proveedor. Intenta de nuevo.',
    );
  }
}
