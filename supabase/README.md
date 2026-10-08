# Backend de Deriva

Este directorio entrega SQL, pruebas y Edge Functions independientes de la app Expo. La migración crea tablas `deriva_*`, esquema privado, RPC, RLS, bucket privado `deriva-photos` y publicaciones Realtime. No reemplaza tablas, políticas, triggers ni trabajos que ya existan en el proyecto.

## Aplicar en un proyecto nuevo

Ejecuta desde la raíz que contiene `supabase/`. Sintaxis revisada mediante `--help` con Supabase CLI 2.119.0:

```bash
npx --yes supabase@2.119.0 login
npx --yes supabase@2.119.0 link --project-ref TU_PROJECT_REF
npx --yes supabase@2.119.0 db push --dry-run
npx --yes supabase@2.119.0 db push
```

Las migraciones `20261003051749_deriva_initial.sql` y `20261005021423_deriva_remote_publications.sql` introducen roles propios de Deriva y pagos consumibles, con suscripciones Realtime. El wrapper de publicación anterior es exclusivamente local y no acepta Premium como autorización. Si el proyecto ya tiene otro historial de migraciones, consérvalo: no borres ni reescribas versiones ajenas a este directorio para hacerlas coincidir con este checkout.

`config.toml` configura PostgreSQL 17 y Auth local. La confirmación de correo desactivada allí solo afecta desarrollo local. En un proyecto nuevo, revisa los ajustes alojados de Auth y configura una URL web válida para confirmar el correo; después puedes iniciar sesión manualmente en la app. El registro envía `full_name` de 2 a 60 caracteres para cumplir el trigger de altas que ya exige ese dato.

## Stripe de prueba y funciones

El modelo actual cobra **1 USD por ubicación remota**, sin suscripciones. Stripe de prueba usa un precio fijo y un Payment Link. No necesita una clave API secreta para abrir los pagos: el backend autentica al usuario, crea un ticket opaco y agrega su referencia al enlace de prueba.

La migración `20261005030841_deriva_payment_link_tickets.sql` agrega configuración y tickets en `deriva_private`. Las RPC `deriva_configure_payment_link`, `deriva_payment_link_config`, `deriva_checkout_ticket` y `deriva_record_payment_link_purchase` son exclusivas del servicio. El secreto `whsec_…` se guarda cifrado en Vault, nunca en archivos ni en Expo. Los tickets duran 24 horas; se verifica cuándo Stripe creó el Checkout, permitiendo webhooks entregados tarde. Cada sesión pagada distinta concede un crédito y sus reintentos no lo duplican.

El runtime proporciona `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`; nunca se incluyen en Expo. El webhook comprueba la firma antes de analizar JSON y admite exclusivamente pagos de prueba de 100 centavos USD en el enlace configurado.

```bash
npx --yes supabase@2.119.0 functions deploy deriva-remote-checkout deriva-stripe-webhook --use-api --no-verify-jwt --project-ref TU_PROJECT_REF
```

`verify_jwt = false` permite las llamadas de Stripe; Checkout valida explícitamente el JWT mediante `auth.getUser`. La cuenta admin y los créditos ya disponibles evitan otro cobro.

| Función | Autenticación |
| --- | --- |
| `deriva-remote-checkout` POST | JWT validado por `auth.getUser`; importe fijo, modo de prueba, evita cobrar a admin o con crédito pendiente |
| `deriva-remote-checkout` GET | Retorno público informativo; no concede permisos |
| `deriva-stripe-webhook` | HMAC-SHA256 de Stripe sobre cuerpo original, ventana de cinco minutos y comprobación de evento pagado de prueba |
| `deriva-push-worker` | Token de trabajo de un solo uso validado por RPC |

[Guía de configuración y prueba de Stripe](../docs/stripe-pruebas.md). La app vuelve a consultar acceso al regresar al primer plano; no confía en parámetros del navegador para confirmar el pago.

`deriva_roles` y `deriva_remote_purchases` tienen RLS y lectura exclusiva del propietario. Los clientes no pueden escribir ni concederse privilegios. `deriva_get_access()` devuelve `is_admin` y `remote_credits`. `deriva_create_place_v2` crea el lugar y consume un solo crédito en la misma transacción. Reintentos, reembolsos y cambios de rol se serializan; los identificadores sobreviven a la eliminación del lugar.

## Exploración: visitas verificadas

La migración `20261008061830_deriva_exploration_visits.sql` hace que las ubicaciones remotas se ganen explorando. Una cuenta debe llegar en persona a **3 lugares** antes de poder pagar o publicar un punto remoto.

- `public.deriva_place_visits` guarda una fila por cuenta y lugar (`place_key` es el UUID de `deriva_places` o `demo-1`…`demo-6`). Tiene RLS: cada cuenta solo lee sus visitas y ningún cliente puede escribirlas. No tiene clave foránea al lugar, para que una visita sobreviva aunque se borre la publicación. Está en Realtime.
- `deriva_private.preview_places` replica las coordenadas de `src/data/preview.ts` para verificar visitas a los ejemplos, que no viven en `deriva_places`. La prueba `tests/exploration.test.ts` falla si se desincronizan.
- `deriva_record_visit(place_key, latitud, longitud, precisión, timestamp)` exige sesión, GPS de 100 m de precisión o mejor, de menos de dos minutos, y una distancia de 100 m o menos (`deriva_private.arrival_radius_meters()`). Las publicaciones propias se rechazan. Es idempotente y devuelve `recorded`, `visits`, `required_visits`, `unlocked` y `just_unlocked`. La visita que completa el requisito agrega el aviso «Exploración completada» a Actividad.
- `deriva_get_access()` ahora también devuelve `visits` y `required_visits`.
- `deriva_create_place_v2` rechaza un punto remoto sin las visitas (42501) antes de consumir crédito, y `deriva_checkout_ticket` falla con `exploration_required`, así que no se puede pagar antes de explorar. Los administradores siguen exentos.

`deriva-remote-checkout` traduce `exploration_required` a un 403 con mensaje en español. Después de aplicar la migración, vuelve a desplegarla:

```bash
npx --yes supabase@2.119.0 functions deploy deriva-remote-checkout --use-api --no-verify-jwt --project-ref TU_PROJECT_REF
```

Sin ese redeploy, el bloqueo sigue vigente en la base de datos, pero Checkout responde con un error genérico.

Para asignar un administrador de Deriva, desde una conexión de servicio/administrador:

```sql
select public.deriva_set_admin('UUID_DE_LA_CUENTA', true);
```

Ese rol pertenece solo a Deriva. No otorga administración del proyecto Supabase ni de otras aplicaciones que compartan la base. Las funciones antiguas `deriva-billing-sync` y `deriva-revenuecat` se conservan por compatibilidad, pero sus entitlements ya no autorizan publicaciones remotas y no forman parte del cliente actual.

## Activar y controlar el worker

Después del despliegue, ejecuta como administrador o servicio:

```sql
select public.deriva_configure_push(
  'https://TU_PROJECT_REF.supabase.co/functions/v1/deriva-push-worker'
);
```

La RPC admite el endpoint HTTPS estándar del proyecto Supabase. Programa solo `deriva-push` cada minuto. Cada llamada genera un token aleatorio de 72 caracteres, guarda únicamente SHA256 en `deriva_private` y permite un uso durante 120 segundos; no necesita un secreto permanente del cron.

Consulta sin exponer tokens:

```sql
select jobname, schedule, active from cron.job where jobname = 'deriva-push';
select state, count(*) from public.deriva_push_queue group by state;
```

Para detener este worker, ejecuta `select cron.unschedule('deriva-push');`; vuelve a activarlo con `deriva_configure_push`. La cola reintenta errores transitorios y consulta receipts. Un receipt correcto significa aceptación por APNs/FCM; la entrega visible se comprueba en el teléfono.

## Verificar

Ejecuta el archivo completo con una conexión de administrador configurada en `DERIVA_DATABASE_URL`:

```bash
psql "$DERIVA_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/deriva_rules.sql
psql "$DERIVA_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/deriva_remote_publications.sql
psql "$DERIVA_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/deriva_payment_link_tickets.sql
psql "$DERIVA_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/deriva_exploration.sql
```

La suite inicia una transacción y termina en `ROLLBACK`; revierte fixtures, tokens, derechos, ajustes de Storage y cambios del worker/cron. No la ejecutes fragmentada. Comprueba reglas de publicación, aislamiento de cuentas, Storage, privilegios, reintentos y autenticación de cron, incluyendo replay y expiración.

Las tres suites pasaron en PostgreSQL alojado. Sus fixtures se revirtieron: el estado previo de dos usuarios, tres lugares y cero compras permaneció intacto, junto con el rol admin solicitado y la configuración real del Payment Link. Se comprobaron publicación local, admin, compra consumible, intentos de elevar privilegios, RLS, rollback, reintentos y reembolsos fuera de orden. La concurrencia está protegida con bloqueos transaccionales; estas suites no crean carreras físicas entre conexiones.

Los dos endpoints Stripe pasaron Deno check y las pruebas unitarias de firma/pago. Los endpoints v3 rechazan Checkout sin sesión (401) y webhook sin firma (400); un evento sintético firmado e ignorable devolvió 200 sin conceder créditos. El retorno es informativo. Stripe y Vault están configurados para prueba. La transacción completa desde Expo Go y los sensores siguen pendientes de comprobar en un teléfono.

`deriva_exploration.sql` comprueba llegadas válidas y rechazadas (lejos, GPS viejo o impreciso, lugar propio o inexistente), idempotencia, desbloqueo y su aviso único, bloqueo de pago y publicación remota antes de 3 visitas, que los clientes no pueden falsificar visitas, durabilidad tras borrar el lugar y la exención de admin. Las suites que publican puntos remotos crean tres visitas de ejemplo como fixture.

El advisor reportó seis INFO por RLS sin políticas en tablas privadas/cola, deliberadamente inaccesibles a clientes, y un WARN preexistente de protección de contraseñas filtradas desactivada en Auth. [RLS sin políticas](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [protección de contraseñas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). No se cambiaron políticas ni la configuración de Auth que ya existían.
