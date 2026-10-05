import { HttpError, isRecord, isUuid } from "./core.ts";
import { fetchJson } from "./http.ts";

export const STRIPE_API_VERSION = "2026-09-30.endive";
export const REMOTE_POINT_AMOUNT = 100;
export const REMOTE_POINT_CURRENCY = "usd";

function invalidEvent(): never {
  throw new HttpError(
    400,
    "invalid_stripe_event",
    "El evento de pago no es válido.",
  );
}

export function stripeTestSecret(secret: string | undefined): string {
  if (!secret || !/^sk_test_[A-Za-z0-9]+$/.test(secret)) {
    throw new HttpError(
      503,
      "stripe_not_configured",
      "Los pagos de prueba aún no están configurados. Falta la clave de prueba de Stripe en el servidor.",
    );
  }
  return secret;
}

export function checkoutRequestId(payload: unknown): string {
  if (!isRecord(payload) || !isUuid(payload.requestId)) {
    throw new HttpError(
      400,
      "invalid_request",
      "Vuelve al mapa e intenta el pago de nuevo.",
    );
  }
  return payload.requestId.toLowerCase();
}

export function checkoutBody(
  userId: string,
  requestId: string,
  returnUrl: string,
): URLSearchParams {
  if (!isUuid(userId) || !isUuid(requestId)) {
    throw new Error("Invalid checkout identity");
  }
  const url = new URL(returnUrl);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("Invalid return URL");
  }
  const body = new URLSearchParams({
    mode: "payment",
    "payment_method_types[0]": "card",
    "line_items[0][price_data][currency]": REMOTE_POINT_CURRENCY,
    "line_items[0][price_data][unit_amount]": String(REMOTE_POINT_AMOUNT),
    "line_items[0][price_data][product_data][name]":
      "Deriva · un lugar en el mapa",
    "line_items[0][quantity]": "1",
    client_reference_id: userId,
    locale: "es-419",
    success_url: `${url.href}?return=success`,
    cancel_url: `${url.href}?return=cancel`,
  });
  // Metadata on a Session is not automatically copied to its PaymentIntent.
  // Both are marked so refunds from other apps using this Stripe account are ignored.
  const metadata = {
    application: "deriva",
    deriva_kind: "remote_point",
    deriva_user_id: userId,
    deriva_request_id: requestId,
  };
  for (const [key, value] of Object.entries(metadata)) {
    body.set(`metadata[${key}]`, value);
    body.set(`payment_intent_data[metadata][${key}]`, value);
  }
  return body;
}

export async function createStripeCheckout(
  userId: string,
  requestId: string,
  returnUrl: string,
  secret: string | undefined,
  fetcher: typeof fetch = fetch,
) {
  const key = stripeTestSecret(secret);
  // Same account and request reuse the same Checkout. A different account cannot
  // retrieve another user's session by sending their request UUID.
  const result = await fetchJson(
    "https://api.stripe.com/v1/checkout/sessions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Stripe-Version": STRIPE_API_VERSION,
        "Idempotency-Key": `deriva-remote-${userId}-${requestId}`,
      },
      body: checkoutBody(userId, requestId, returnUrl),
    },
    fetcher,
  );
  if (!result.ok) {
    throw new HttpError(
      503,
      "stripe_unavailable",
      "No se pudo abrir Stripe. Intenta de nuevo; no se ha confirmado ningún pago.",
    );
  }
  const session = result.payload;
  if (
    !isRecord(session) || session.livemode !== false ||
    typeof session.id !== "string" ||
    !/^cs_test_[A-Za-z0-9]+$/.test(session.id) ||
    session.mode !== "payment" ||
    session.amount_total !== REMOTE_POINT_AMOUNT ||
    session.currency !== REMOTE_POINT_CURRENCY ||
    session.client_reference_id !== userId ||
    typeof session.url !== "string"
  ) {
    throw new HttpError(
      503,
      "invalid_checkout",
      "No se pudo verificar la sesión de prueba de Stripe.",
    );
  }
  const checkoutUrl = new URL(session.url);
  if (
    checkoutUrl.protocol !== "https:" ||
    checkoutUrl.hostname !== "checkout.stripe.com" ||
    checkoutUrl.username || checkoutUrl.password || checkoutUrl.port
  ) {
    throw new HttpError(
      503,
      "invalid_checkout",
      "La dirección de pago de Stripe no es válida.",
    );
  }
  return {
    url: checkoutUrl.href,
    sessionId: session.id,
    amount: REMOTE_POINT_AMOUNT,
    currency: REMOTE_POINT_CURRENCY,
    testMode: true as const,
  };
}

export async function readStripeBody(
  request: Request,
  maximumBytes = 256 * 1024,
): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) invalidEvent();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximumBytes) {
        await reader.cancel();
        throw new HttpError(
          413,
          "payload_too_large",
          "El evento excede el tamaño permitido.",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    invalidEvent();
  }
}

// Stripe's documented manual verification protocol, using native WebCrypto:
// https://docs.stripe.com/webhooks#verify-manually
// JSON must not be parsed/re-serialized before this check.
export async function verifyStripeSignature(
  body: string,
  signature: string | null,
  secret: string | undefined,
  now = Date.now(),
): Promise<void> {
  if (!secret || !/^whsec_[A-Za-z0-9]+$/.test(secret)) {
    throw new HttpError(
      503,
      "stripe_webhook_not_configured",
      "Falta configurar el secreto del webhook de Stripe de prueba.",
    );
  }
  const reject = () => {
    throw new HttpError(
      400,
      "invalid_stripe_signature",
      "La firma de Stripe no es válida.",
    );
  };
  if (!signature || signature.length > 4096) reject();
  const fields = signature!.split(",").map((field) => field.trim().split("="));
  const timestamps = fields.filter(([name]) => name === "t");
  const hashes = fields.filter(([name, hash]) =>
    name === "v1" && /^[a-f0-9]{64}$/i.test(hash ?? "")
  ).map(([, hash]) => hash);
  const timestamp = timestamps[0]?.[1];
  if (
    timestamps.length !== 1 || !timestamp || !/^\d{1,12}$/.test(timestamp) ||
    !hashes.length ||
    !Number.isFinite(now) || Math.abs(now / 1000 - Number(timestamp)) > 300
  ) reject();
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signed = encoder.encode(`${timestamp}.${body}`);
  for (const hash of hashes) {
    const bytes = Uint8Array.from(
      hash.match(/../g)!,
      (byte) => parseInt(byte, 16),
    );
    if (await crypto.subtle.verify("HMAC", key, bytes, signed)) return;
  }
  reject();
}

export type StripeAction =
  | {
    type: "purchase";
    userId: string;
    sessionId: string;
    paymentIntentId: string;
    amountTotal: number;
    currency: string;
  }
  | {
    type: "refund";
    paymentIntentId: string;
    amountRefunded: number;
    currency: string;
  }
  | { type: "ignore" };

export function stripeEventAction(payload: unknown): StripeAction {
  if (
    !isRecord(payload) || typeof payload.id !== "string" ||
    !/^evt_[A-Za-z0-9]+$/.test(payload.id) ||
    typeof payload.type !== "string" || payload.livemode !== false ||
    !isRecord(payload.data) ||
    !isRecord(payload.data.object)
  ) invalidEvent();
  const object = payload.data.object;
  if (
    ![
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
      "charge.refunded",
    ].includes(payload.type)
  ) {
    return { type: "ignore" };
  }
  const metadata = object.metadata;
  if (
    !isRecord(metadata) || metadata.application !== "deriva" ||
    metadata.deriva_kind !== "remote_point"
  ) return { type: "ignore" };
  if (
    object.livemode !== false || !isUuid(metadata.deriva_user_id) ||
    !isUuid(metadata.deriva_request_id) ||
    object.currency !== REMOTE_POINT_CURRENCY ||
    typeof object.payment_intent !== "string" ||
    !/^pi_[A-Za-z0-9]+$/.test(object.payment_intent)
  ) invalidEvent();
  if (payload.type === "charge.refunded") {
    if (
      object.object !== "charge" || object.paid !== true ||
      object.status !== "succeeded" ||
      object.amount !== REMOTE_POINT_AMOUNT ||
      !Number.isInteger(object.amount_refunded) ||
      (object.amount_refunded as number) <= 0 ||
      (object.amount_refunded as number) > REMOTE_POINT_AMOUNT
    ) invalidEvent();
    return {
      type: "refund",
      paymentIntentId: object.payment_intent,
      amountRefunded: object.amount_refunded as number,
      currency: REMOTE_POINT_CURRENCY,
    };
  }
  if (
    object.object !== "checkout.session" || typeof object.id !== "string" ||
    !/^cs_test_[A-Za-z0-9]+$/.test(object.id) ||
    object.mode !== "payment" || object.amount_total !== REMOTE_POINT_AMOUNT ||
    object.client_reference_id !== metadata.deriva_user_id
  ) invalidEvent();
  // Checkout completion can precede payment for asynchronous payment methods.
  if (object.payment_status !== "paid") return { type: "ignore" };
  if (object.status !== "complete") invalidEvent();
  return {
    type: "purchase",
    userId: metadata.deriva_user_id,
    sessionId: object.id,
    paymentIntentId: object.payment_intent,
    amountTotal: REMOTE_POINT_AMOUNT,
    currency: REMOTE_POINT_CURRENCY,
  };
}

export function checkoutReturnResponse(cancelled: boolean): Response {
  const title = cancelled ? "Pago cancelado" : "Vuelve a Deriva";
  const message = cancelled
    ? "No se ha confirmado ningún pago. Puedes volver al mapa."
    : "Abre Deriva para continuar. La app comprobará el pago con el servidor antes de habilitar la publicación.";
  // Standard Supabase function domains do not serve custom HTML pages. Plain
  // text stays readable there and does not pretend the redirect verifies payment.
  return new Response(
    `DERIVA · PAGO DE PRUEBA\n\n${title}\n\n${message}\n\nPuedes cerrar esta pestaña y regresar a Expo Go.`,
    {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
