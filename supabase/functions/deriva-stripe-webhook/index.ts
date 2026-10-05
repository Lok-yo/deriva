import { createServiceClient } from "../_shared/backend.ts";
import { HttpError } from "../_shared/core.ts";
import { errorResponse, jsonResponse } from "../_shared/http.ts";
import {
  readStripeBody,
  stripeEventAction,
  verifyStripeSignature,
} from "../_shared/stripe.ts";

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return jsonResponse(
      { error: "Utiliza POST.", code: "method_not_allowed" },
      405,
    );
  }
  try {
    const body = await readStripeBody(request);
    const client = createServiceClient();
    const config = await client.rpc("deriva_payment_link_config");
    if (config.error || !config.data) throw new HttpError(503, "stripe_webhook_not_configured", "El servicio de pagos de prueba no está disponible.");
    await verifyStripeSignature(
      body,
      request.headers.get("stripe-signature"),
      config.data.webhook_secret,
    );
    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      throw new HttpError(
        400,
        "invalid_stripe_event",
        "El evento de Stripe no contiene JSON válido.",
      );
    }
    const action = stripeEventAction(payload, config.data.payment_link_id);
    if (action.type === "ignore") {
      return jsonResponse({ received: true, ignored: true });
    }
    // RPCs enforce uniqueness on both Checkout and PaymentIntent. Refund tombstones
    // also prevent a delayed completion event from recreating a refunded credit.
    const { error } = action.type === "link_purchase"
      ? await client.rpc("deriva_record_payment_link_purchase", {
        p_ticket_id: action.ticketId, p_payment_link_id: action.paymentLinkId,
        p_checkout_session_id: action.sessionId, p_payment_intent_id: action.paymentIntentId,
        p_checkout_created_at: action.createdAt, p_amount_total: action.amountTotal, p_currency: action.currency,
      })
      : action.type === "purchase"
      ? await client.rpc("deriva_record_remote_purchase", {
        p_user_id: action.userId,
        p_checkout_session_id: action.sessionId,
        p_payment_intent_id: action.paymentIntentId,
        p_amount_total: action.amountTotal,
        p_currency: action.currency,
      })
      : await client.rpc("deriva_refund_remote_purchase", {
        p_payment_intent_id: action.paymentIntentId,
        p_amount_refunded: action.amountRefunded,
        p_currency: action.currency,
      });
    if (error) {
      throw new HttpError(
        503,
        "stripe_sync_unavailable",
        "No se pudo registrar el evento de pago. Stripe volverá a intentarlo.",
      );
    }
    return jsonResponse({ received: true });
  } catch (error) {
    return errorResponse(error);
  }
});
