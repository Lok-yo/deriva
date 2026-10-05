# Pagos de prueba de Deriva

Cada pago habilita **una publicación remota por 1 USD**. No es una suscripción. Las publicaciones locales siguen siendo gratuitas y las cuentas con el rol de administrador de Deriva publican remotamente sin pagar. Un crédito disponible evita que el cliente y el servidor abran otro cobro innecesario.

## Configuración pendiente en Stripe y Supabase

1. En Stripe, activa el entorno de prueba y obtén su clave secreta `sk_test_…`.
2. Guarda esa clave exclusivamente como secreto de las Edge Functions de Supabase con el nombre `DERIVA_STRIPE_TEST_SECRET_KEY`. Nunca la pongas en `.env` de Expo ni en una variable `EXPO_PUBLIC_*`.
3. Crea en Stripe un destino de webhook **de prueba**, con API `2026-09-30.endive`, dirigido a:
   `https://kqabddlasmvipuskvnvr.supabase.co/functions/v1/deriva-stripe-webhook`
4. Selecciona `checkout.session.completed`, `checkout.session.async_payment_succeeded` y `charge.refunded`. Guarda su secreto `whsec_…` en Supabase como `DERIVA_STRIPE_WEBHOOK_SECRET`.
5. Abre la app con Expo Go por tu cuenta. Desde una cuenta sin rol admin ni crédito, toca un punto vacío, inicia Checkout y usa una tarjeta de prueba de Stripe (por ejemplo, `4242 4242 4242 4242`, fecha futura y CVC de tres dígitos).
6. Vuelve a Expo Go. El webhook confirma el crédito y la app actualiza el acceso. Publicar el lugar consume un crédito; otro lugar remoto necesita otro pago.

Sin esos secretos el servicio devuelve un error de configuración. No simula compras exitosas. Las claves reales `sk_live_…` y eventos `livemode: true` se rechazan deliberadamente.

## Contrato y verificación

- `POST deriva-remote-checkout`: JWT de usuario en `Authorization`, cuerpo `{ "requestId": "UUID" }`. Devuelve `{ url, sessionId, amount: 100, currency: "usd", testMode: true }`.
- El servidor valida al usuario mediante Auth, fija importe y moneda y crea un Checkout de una sola compra. Stripe recibe una clave de idempotencia distinta por usuario y solicitud. Un reintento de red con el mismo UUID recupera la misma sesión durante la ventana de idempotencia de Stripe.
- La respuesta `409 / remote_access_available` significa que el usuario ya es administrador o tiene un crédito disponible: la app debe actualizar su estado y continuar sin otro pago.
- El retorno del navegador muestra texto y pide volver a Expo Go. Un parámetro de retorno nunca concede permisos ni confirma un pago.
- Solo el webhook firmado registra compras. Verifica HMAC-SHA256 sobre el cuerpo original, una tolerancia de cinco minutos, modo de prueba, aplicación `deriva`, usuario, Checkout completo y pagado, importe exacto de 100 centavos y moneda USD.
- El RPC de compra es exclusivo del servidor. Sesión de Checkout y PaymentIntent son únicos. Repetir un evento no multiplica créditos; la publicación los consume atómicamente. Un reembolso exitoso parcial o total invalida el crédito, incluso si el aviso de reembolso llega antes que el de compra.
- El reembolso de un crédito ya utilizado no borra automáticamente el lugar publicado. Se conserva el historial de consumo.

Las pruebas automatizadas cubren firmas alteradas, replay, rotación de secreto, límite de bytes, mezcla entre cuentas, importes, modo real, respuestas de Checkout ajenas, retorno sin confirmación y reembolsos. La prueba integral con tarjeta requiere configurar Stripe y usar un teléfono; un build o test local no sustituye esa verificación.

Fuentes oficiales: [crear Checkout](https://docs.stripe.com/api/checkout/sessions/create), [firmas y eventos](https://docs.stripe.com/webhooks), [idempotencia](https://docs.stripe.com/api/idempotent_requests), [versiones de API](https://docs.stripe.com/api/versioning), [autenticación de Edge Functions](https://supabase.com/docs/guides/functions/auth).
