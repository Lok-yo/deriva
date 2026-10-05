# Pagos de prueba de Deriva

Cada pago habilita **una publicación remota por 1 USD**. Las publicaciones locales son gratuitas y el administrador de Deriva publica remotamente sin pagar. Un crédito disponible evita abrir otro cobro.

## Configuración

La cuenta de prueba **New business** (`acct_1QuHMoK6FTj0u2Hi`) contiene el precio `price_1UN2EfK6FTj0u2HihYAkVh0z`, Payment Link `plink_1UN2EpK6FTj0u2HiL3FSTIZy` y webhook `we_1UN2F6K6FTj0u2HiyGTGmTe3`. El webhook tiene API `2026-08-26.dahlia` y eventos `checkout.session.completed`, `checkout.session.async_payment_succeeded` y `charge.refunded`.

El servidor guarda el enlace y el secreto de firma en configuración privada y **Supabase Vault**. No necesitas compartir una clave API ni agregar secretos a `.env` de Expo. El secreto del webhook tampoco aparece en este repositorio.

## Probar desde Expo Go

1. Inicia Expo por tu cuenta y abre Deriva en el teléfono.
2. Inicia sesión con una cuenta sin rol admin ni crédito disponible. Toca un punto vacío y elige publicar allí por 1 USD.
3. Abre el pago desde Deriva y usa la tarjeta de prueba `4242 4242 4242 4242`, fecha futura y CVC de tres dígitos. No se realizan cargos reales.
4. Regresa a Expo Go. El webhook confirma el crédito y la app actualiza el acceso.
5. Publicar consume un crédito. Otro punto remoto necesita otro pago; un crédito disponible evita un cobro adicional.

La prueba integral en un teléfono sigue pendiente: provisionar Stripe o pasar pruebas automatizadas no sustituye esa comprobación.

## Contrato y seguridad

- `POST deriva-remote-checkout`: JWT en `Authorization`, cuerpo `{ "requestId": "UUID" }`. Devuelve `{ url, checkoutKind: "payment_link", requestId: "UUID opaco", paymentLinkId, amount: 100, currency: "usd", testMode: true }`.
- El servidor obtiene la cuenta mediante Auth y genera un ticket opaco para `client_reference_id`. El cliente no elige el dueño de una compra. Reintentos del mismo usuario y solicitud recuperan el ticket; otra cuenta obtiene otro. Un ticket vencido se renueva una vez desde la app.
- `409 / remote_access_available` indica que ya hay crédito o rol admin. La app vuelve a consultar acceso y continúa sin otro pago.
- Solo el webhook firmado registra compras: HMAC-SHA256 sobre bytes originales, tolerancia de cinco minutos, modo de prueba, metadata de Deriva, enlace configurado, ticket válido, Checkout completo y pagado, importe exacto y USD. Métodos asíncronos pendientes no conceden crédito.
- La validez de 24 horas se aplica al momento de creación del Checkout, no al de entrega del webhook. Una entrega retrasada de un pago válido puede confirmarse.
- Cada sesión pagada distinta otorga un crédito, aunque reutilice un ticket. Checkout y PaymentIntent son únicos: reintentar el mismo evento no multiplica créditos. Publicar consume uno atómicamente.
- Reembolsos parciales o totales invalidan el crédito. Si llegan antes del aviso de compra, una marca persistente impide recrearlo. Un crédito consumido conserva su historial; el reembolso no borra automáticamente el lugar.
- Las RPC de configuración, tickets y pagos son exclusivas del servicio. Ni clientes autenticados ni anónimos pueden leer el secreto o generar créditos. El retorno del navegador nunca confirma un pago.

Fuentes oficiales: [referencias de Payment Links](https://docs.stripe.com/payment-links/url-parameters), [firmas de webhook](https://docs.stripe.com/webhooks), [Supabase Vault](https://supabase.com/docs/guides/database/vault).
