# Backend de Deriva

Este directorio entrega SQL, pruebas y tres Edge Functions independientes de la app Expo. La migración crea tablas `deriva_*`, esquema privado, RPC, RLS, bucket privado `deriva-photos` y publicaciones Realtime. Conserva las tablas, políticas, triggers y trabajos de asistencia existentes.

## Aplicar en un proyecto nuevo

Ejecuta desde la raíz que contiene `supabase/`. Sintaxis revisada mediante `--help` con Supabase CLI 2.119.0:

```bash
npx --yes supabase@2.119.0 login
npx --yes supabase@2.119.0 link --project-ref TU_PROJECT_REF
npx --yes supabase@2.119.0 db push --dry-run
npx --yes supabase@2.119.0 db push
```

La migración es `migrations/20261003051749_deriva_initial.sql`. En el proyecto conectado `kqabddlasmvipuskvnvr` ya está aplicada. Su historial incluye migraciones de asistencia ausentes de este directorio: conserva el historial completo antes de futuras migraciones compartidas; no repares ni elimines sus versiones para hacer coincidir este checkout.

`config.toml` configura PostgreSQL 17 y Auth local. La confirmación de correo desactivada allí solo afecta desarrollo local. En un proyecto nuevo, revisa los ajustes alojados de Auth y configura una URL web válida para confirmar el correo; después puedes iniciar sesión manualmente en la app. En el proyecto compartido, Deriva envía `full_name` de 2 a 60 caracteres para cumplir el requisito del trigger de asistencia existente.

## Secretos y funciones

Configura secretos en el dashboard de Edge Functions o en un archivo local `supabase/.env.functions`, excluido de Git:

| Variable | Uso |
| --- | --- |
| `REVENUECAT_SECRET_API_KEY` | Clave privada v1 con lectura de clientes para verificar `deriva_premium` |
| `REVENUECAT_WEBHOOK_AUTH` | Secreto aleatorio; RevenueCat lo envía como `Authorization: Bearer …` |
| `EXPO_ACCESS_TOKEN` | Opcional; requerido si activas seguridad adicional de Expo Push Service |

El runtime alojado proporciona `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`; estos valores permanecen en el servidor. El cliente Expo utiliza una clave publishable. [Variables del runtime](https://supabase.com/docs/guides/functions/secrets).

```bash
npx --yes supabase@2.119.0 secrets set --env-file supabase/.env.functions --project-ref TU_PROJECT_REF
npx --yes supabase@2.119.0 functions deploy deriva-billing-sync deriva-revenuecat deriva-push-worker --use-api --no-verify-jwt --project-ref TU_PROJECT_REF
```

Despliega únicamente esas tres funciones; conserva las funciones del resto del proyecto. En `config.toml` tienen `verify_jwt = false` porque cada handler autentica antes de operar:

| Función | Autenticación |
| --- | --- |
| `deriva-billing-sync` | JWT de usuario validado con `auth.getUser`; no admite usuarios anónimos |
| `deriva-revenuecat` | Secreto de webhook; reconsulta RevenueCat para todos los UUID afectados |
| `deriva-push-worker` | Cabecera `x-deriva-job-token`, validada y consumida mediante RPC de servicio |

La comprobación propia es necesaria con claves publishable y llamadas de servidores externos. [Autenticación de Edge Functions](https://supabase.com/docs/guides/functions/auth). Configura RevenueCat hacia `https://TU_PROJECT_REF.supabase.co/functions/v1/deriva-revenuecat`; los UUID de Supabase son sus App User IDs.

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
```

La suite inicia una transacción y termina en `ROLLBACK`; revierte fixtures, tokens, derechos, ajustes de Storage y cambios del worker/cron. No la ejecutes fragmentada. Comprueba reglas de publicación, aislamiento de cuentas, Storage, privilegios, reintentos y autenticación de cron, incluyendo replay y expiración.

Al 3 de octubre de 2026 pasaron la suite en PostgreSQL 17 alojado, 16 comprobaciones de API real de Auth/Storage/RLS/Realtime, tres checks de Deno y ocho comprobaciones de handlers con dependencias sustituidas. Las tres funciones están activas en versión 1; el cron autenticado respondió HTTP 200 con cola vacía. Pagos reales, sensores y push visible quedan pendientes en [aceptación](../docs/acceptance.md).

Los cuatro INFO del advisor por RLS sin políticas son intencionales para tablas privadas y cola. El WARN de protección de contraseñas filtradas desactivada pertenece al Auth compartido preexistente. El aislamiento de tablas no separa los usuarios del checador; utiliza otro proyecto si necesitas Auth independiente.
