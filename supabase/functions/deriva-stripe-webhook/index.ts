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
    await verifyStripeSignature(
      body,
      request.headers.get("stripe-signature"),
      Deno.env.get("DERIVA_STRIPE_WEBHOOK_SECRET"),
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
    const action = stripeEventAction(payload);
    if (action.type === "ignore") {
      return jsonResponse({ received: true, ignored: true });
    }
    const client = createServiceClient();
    // RPCs enforce uniqueness on both Checkout and PaymentIntent. Refund tombstones
    // also prevent a delayed completion event from recreating a refunded credit.
    const { error } = action.type === "purchase"
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
