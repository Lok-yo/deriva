import { createServiceClient, syncEntitlement } from '../_shared/backend.ts';
import {
  bearerToken,
  extractRevenueCatUsers,
  HttpError,
  mapConcurrent,
  parseRevenueCatEvent,
  readLimitedJson,
  secretMatches,
} from '../_shared/core.ts';
import { errorResponse, jsonResponse } from '../_shared/http.ts';
import { queryRevenueCat } from '../_shared/revenuecat.ts';

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') {
    return jsonResponse(
      { error: 'Utiliza POST.', code: 'method_not_allowed' },
      405,
    );
  }
  try {
    const webhookSecret = Deno.env.get('REVENUECAT_WEBHOOK_AUTH');
    if (!webhookSecret) {
      throw new HttpError(
        503,
        'webhook_not_configured',
        'El servicio de eventos de pagos todavía no está configurado.',
      );
    }
    if (
      !await secretMatches(
        bearerToken(request.headers.get('authorization')),
        webhookSecret,
      )
    ) {
      throw new HttpError(
        401,
        'invalid_webhook_auth',
        'El evento no está autorizado.',
      );
    }
    const event = parseRevenueCatEvent(await readLimitedJson(request));
    if (event.type === 'TEST') {
      return jsonResponse({ received: true, test: true });
    }
    const users = extractRevenueCatUsers(event);
    if (users.length === 0) {
      return jsonResponse({ received: true, ignored: true });
    }
    const billingSecret = Deno.env.get('REVENUECAT_SECRET_API_KEY');
    if (!billingSecret) {
      throw new HttpError(
        503,
        'billing_not_configured',
        'Los pagos todavía no están configurados.',
      );
    }
    const client = createServiceClient();
    // Event flags never grant access. Every affected account, including transfer origins,
    // gets an authoritative snapshot. Repeating the event is therefore idempotent.
    const results = await mapConcurrent(users, 25, async (userId) => {
      try {
        const { snapshot, observedAt } = await queryRevenueCat(
          userId,
          billingSecret,
        );
        await syncEntitlement(client, userId, snapshot, observedAt);
        return true;
      } catch {
        return false;
      }
    });
    if (results.some((success) => !success)) {
      throw new HttpError(
        503,
        'webhook_sync_unavailable',
        'No fue posible verificar todas las cuentas del evento.',
      );
    }
    return jsonResponse({ received: true, verifiedAccounts: users.length });
  } catch (error) {
    return errorResponse(error);
  }
});
