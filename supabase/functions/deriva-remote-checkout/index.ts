import { createServiceClient } from "../_shared/backend.ts";
import {
  bearerToken,
  HttpError,
  isUuid,
  readLimitedJson,
} from "../_shared/core.ts";
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/http.ts";
import {
  checkoutRequestId,
  checkoutReturnResponse,
  createStripeCheckout,
} from "../_shared/stripe.ts";

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  // This page carries no payment credentials and never grants a credit.
  if (request.method === "GET") {
    return checkoutReturnResponse(
      new URL(request.url).searchParams.get("return") === "cancel",
    );
  }
  if (request.method !== "POST") {
    return jsonResponse(
      { error: "Utiliza POST para abrir el pago.", code: "method_not_allowed" },
      405,
      true,
    );
  }
  try {
    const jwt = bearerToken(request.headers.get("authorization"));
    if (!jwt) {
      throw new HttpError(
        401,
        "authentication_required",
        "Inicia sesión para agregar un lugar en el mapa.",
      );
    }
    const client = createServiceClient();
    const { data, error } = await client.auth.getUser(jwt);
    if (
      error || !data.user || data.user.is_anonymous || !isUuid(data.user.id)
    ) {
      throw new HttpError(
        401,
        "invalid_session",
        "Tu sesión no es válida. Inicia sesión de nuevo.",
      );
    }
    const requestId = checkoutRequestId(await readLimitedJson(request, 4096));
    const [role, purchase] = await Promise.all([
      client.from("deriva_roles").select("is_admin").eq("user_id", data.user.id)
        .maybeSingle(),
      client.from("deriva_remote_purchases").select("id").eq(
        "user_id",
        data.user.id,
      ).eq("status", "available").limit(1),
    ]);
    if (role.error || purchase.error) {
      throw new HttpError(
        503,
        "remote_access_unavailable",
        "No se pudo verificar si necesitas pagar. Intenta de nuevo.",
      );
    }
    if (role.data?.is_admin === true || purchase.data?.length) {
      throw new HttpError(
        409,
        "remote_access_available",
        "Ya puedes publicar este lugar sin otro pago. Vuelve a Deriva para continuar.",
      );
    }
    const returnUrl = `${
      Deno.env.get("SUPABASE_URL")
    }/functions/v1/deriva-remote-checkout`;
    return jsonResponse(
      await createStripeCheckout(
        data.user.id,
        requestId,
        returnUrl,
        Deno.env.get("DERIVA_STRIPE_TEST_SECRET_KEY"),
      ),
      200,
      true,
    );
  } catch (error) {
    return errorResponse(error, true);
  }
});
