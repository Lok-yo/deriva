import {
  createServiceClient,
  storedEntitlement,
  syncEntitlement,
} from '../_shared/backend.ts';
import { bearerToken, HttpError, isUuid } from '../_shared/core.ts';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/http.ts';
import { queryRevenueCat } from '../_shared/revenuecat.ts';

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return jsonResponse(
      {
        error: 'Utiliza POST para verificar tu compra.',
        code: 'method_not_allowed',
      },
      405,
      true,
    );
  }
  try {
    const jwt = bearerToken(request.headers.get('authorization'));
    if (!jwt) {
      throw new HttpError(
        401,
        'authentication_required',
        'Inicia sesión para verificar tu compra.',
      );
    }
    const client = createServiceClient();
    // Consult Auth itself: decoding a JWT locally would not establish the user's identity.
    const { data, error } = await client.auth.getUser(jwt);
    if (
      error || !data.user || data.user.is_anonymous || !isUuid(data.user.id)
    ) {
      throw new HttpError(
        401,
        'invalid_session',
        'Tu sesión no es válida. Inicia sesión de nuevo.',
      );
    }
    const secret = Deno.env.get('REVENUECAT_SECRET_API_KEY');
    if (!secret) {
      throw new HttpError(
        503,
        'billing_not_configured',
        'Los pagos todavía no están configurados.',
      );
    }
    const current = await storedEntitlement(client, data.user.id);
    const age = current.verifiedAt
      ? Date.now() - Date.parse(current.verifiedAt)
      : Number.POSITIVE_INFINITY;
    if (current.premium && age >= 0 && age <= 5000) {
      return jsonResponse({ ...current, synced: false }, 200, true);
    }
    const { snapshot, observedAt } = await queryRevenueCat(
      data.user.id,
      secret,
    );
    await syncEntitlement(client, data.user.id, snapshot, observedAt);
    // Another request may have saved a newer snapshot while RevenueCat responded.
    return jsonResponse(
      { ...await storedEntitlement(client, data.user.id), synced: true },
      200,
      true,
    );
  } catch (error) {
    return errorResponse(error, true);
  }
});
