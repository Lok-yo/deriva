# Deriva

Una app móvil React Native + Expo para descubrir y compartir lugares en Android e iOS. **Para probarla ahora, ábrela en Expo Go desde tu teléfono.**

## Abrir en Expo Go

```bash
cd /home/kiyo/Proyectos/Aurelio/deriva
npm start
```

1. Instala [Expo Go](https://expo.dev/go) en Android o iOS, con una versión compatible con el SDK 57 del proyecto.
2. Conecta el teléfono y este equipo a la misma red Wi-Fi.
3. Escanea el QR de la terminal: desde Expo Go en Android o con la cámara del iPhone. Se abre Deriva dentro de Expo Go.
4. Mantén la terminal abierta mientras pruebas la app. No necesitas crear un APK ni configurar EAS para abrirla.

Si la red impide conectar, detén el servidor y usa `npm run start:tunnel` para generar otro QR accesible desde otra red. Si acabas de copiar el proyecto a otro equipo, ejecuta `npm ci` antes de iniciar.

El `.env` local ya contiene la URL y la clave **publishable** del proyecto Supabase conectado. Está excluido de Git. El backend está desplegado y el inicio de sesión se verificó con ese proyecto. El registro está integrado; la confirmación y entrega de correo dependen de los ajustes de Auth. Para otro equipo, copia `.env.example` a `.env` y configura tu proyecto. Sin cuenta se muestran seis ejemplos identificados como vista previa; esos lugares nunca se insertan en la base de datos.

En Expo Go puedes probar la navegación, el mapa, la cuenta, Supabase y Realtime, el GPS y la brújula. La cámara exige biometría real: huella en Android o Touch ID en un iPhone compatible. **Face ID no funciona en Expo Go**, así que un iPhone que solo tenga Face ID podrá explorar, pero no completar la foto protegida. [Limitación oficial de Expo](https://docs.expo.dev/versions/v57.0.0/sdk/local-authentication/).

Deriva mantiene las compras reales y el registro de push desactivados en Expo Go; los avisos recibidos por Realtime se consultan en **Actividad** con la app abierta. La integración de tiendas y push está preparada para una fase posterior con una compilación propia. No se simula una compra ni se omite la biometría. [RevenueCat para Expo](https://www.revenuecat.com/docs/getting-started/installation/expo), [notificaciones en SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/).

## Funciones

| Función | Gratis | Premium |
| --- | --- | --- |
| Explorar mapa, elegir un destino al azar y guardar lugares | Sí | Sí |
| Publicar título y fotografía | Cámara, después de biometría | Cámara o galería |
| Ubicación de una publicación | GPS actual, precisión ≤100 m | Cualquier punto elegido en el mapa |
| Brújula hacia un destino y avisos de lugares cercanos | Sí | Sí |

La cámara, el GPS, el magnetómetro y la autenticación biométrica se usan de forma independiente. La galería no cuenta como uso de cámara. No se almacenan huellas ni imágenes de Face ID; el sistema operativo devuelve el resultado de la autenticación.

## Desarrollo nativo posterior

Estos pasos son para probar más adelante Face ID, compras de tienda y push en una compilación propia. No son requisitos para abrir la app en Expo Go.

```bash
npx eas-cli@latest login
npx eas-cli@latest init
```

Configura `EXPO_PUBLIC_EAS_PROJECT_ID` con el UUID del proyecto. Los identificadores iniciales son `com.kiyo.deriva`; deben coincidir con tus apps en las tiendas y RevenueCat. Puedes cambiarlos en `app.config.ts` antes de registrarlas.

```bash
npx eas-cli@latest build --profile development --platform android
npx eas-cli@latest build --profile development --platform ios
npm run start:dev-client
```

Instala el APK o la compilación iOS y abre el servidor de desarrollo. EAS necesita los permisos y credenciales de tus cuentas para firmar la app. Face ID en iOS requiere la compilación propia y el permiso incluido en la configuración.

## Activar pagos

1. Crea las apps Android/iOS en RevenueCat y conecta Google Play Console/App Store Connect. Crea los productos de suscripción en cada tienda.
2. Crea el entitlement **`deriva_premium`**, asocia los productos y añádelos al offering **current**. La app muestra los precios que devuelve la tienda; no inventa un importe.
3. Añade las claves públicas de cada plataforma en `.env`: `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` y `EXPO_PUBLIC_REVENUECAT_IOS_KEY`. Para EAS, configura esos mismos valores en el entorno del proyecto.
4. En los secretos de Edge Functions de Supabase, configura **`REVENUECAT_SECRET_API_KEY`** (clave privada v1 con permiso de lectura de clientes) y **`REVENUECAT_WEBHOOK_AUTH`** (un secreto aleatorio para autenticar el webhook). Ninguno lleva el prefijo `EXPO_PUBLIC_`.
5. Configura el webhook de RevenueCat hacia `https://TU-PROYECTO.supabase.co/functions/v1/deriva-revenuecat`, con Authorization `Bearer TU-SECRETO`.
6. Prueba la compra y restauración con usuarios de sandbox de las tiendas. El UUID de Supabase identifica al comprador en RevenueCat.

Tras comprar, la app llama a `deriva-billing-sync`; el servidor consulta RevenueCat y actualiza los derechos. El webhook reconsulta el estado vigente para reflejar renovaciones, expiraciones, reembolsos y transferencias. Cambiar un indicador local o metadatos del usuario no concede Premium. Si la tienda cobra pero la verificación falla, usa **Restaurar compras**; no vuelvas a pagar.

## Activar notificaciones push

Configura FCM v1 para Android y APNs para iOS siguiendo la [guía oficial de Expo](https://docs.expo.dev/push-notifications/push-notifications-setup/). En Android descarga `google-services.json`, mantenlo fuera de Git y establece `GOOGLE_SERVICES_JSON` con su ruta al compilar. Para EAS usa su almacenamiento de archivos/credenciales.

```bash
npx eas-cli@latest credentials --platform android
npx eas-cli@latest credentials --platform ios
```

En **Perfil**, activa las alertas y elige el radio. Deriva pide permiso, registra un token Expo y guarda una zona centrada en esa lectura del GPS. La zona permanece fija hasta que vuelvas a activarla/actualizarla; no rastrea tu ubicación en segundo plano. Las publicaciones próximas de otras personas llegan al inbox en tiempo real. Al volver a iniciar sesión, se registra de nuevo este teléfono si el permiso sigue concedido. El worker procesa la cola cada minuto, reintenta errores transitorios y consulta receipts para confirmar aceptación por APNs/FCM. La recepción visible en el teléfono se comprueba aparte.

Si habilitas la seguridad adicional de Expo Push Service, configura también el secreto de Edge Functions `EXPO_ACCESS_TOKEN`. Es opcional mientras esa seguridad no esté habilitada.

## Backend y aislamiento

La app usa el proyecto conectado `kqabddlasmvipuskvnvr`. Las tablas `deriva_*`, el esquema `deriva_private` y el bucket privado `deriva-photos` son propios de esta app. Las tablas, fotografías y funciones de asistencia existentes se conservan.

**Auth se comparte:** el trigger existente del checador crea un perfil de asistencia para cualquier nuevo usuario del proyecto. Por eso el registro de Deriva envía `full_name` de 2 a 60 caracteres, además de crear su perfil en `deriva_profiles`. Si necesitas usuarios completamente independientes del checador, crea otro proyecto Supabase y aplica la migración de Deriva allí; no cambies los triggers de asistencia para hacerlo.

El servidor comprueba derechos, propiedad del archivo, campos permitidos, precisión/antigüedad del GPS, distancia entre el punto y el GPS y el límite de 20 publicaciones por día. El UUID de petición permite reintentos sin duplicar lugares. RLS separa guardados, inbox, preferencias, tokens y derechos. Las fotografías se convierten a JPEG sin EXIF y se leen mediante URLs firmadas de una hora.

La evidencia de GPS/cámara/biometría enviada por una app Expo es declarativa: un cliente modificado puede falsificarla. El flujo oficial exige los sensores, pero no ofrece atestación criptográfica del hardware. La biometría no convierte una foto en una prueba de identidad pública.

La [guía del backend](supabase/README.md) explica migración, secretos, despliegue y pruebas de forma independiente. Después de desplegar el worker, actívalo con:

```sql
select public.deriva_configure_push(
  'https://TU-PROYECTO.supabase.co/functions/v1/deriva-push-worker'
);
```

Esta RPC es exclusiva del servicio/administrador. Cada ejecución del cron genera un token aleatorio de 72 caracteres válido durante 120 segundos; se guarda únicamente su SHA256 en el esquema privado y se acepta una sola vez. Las tres funciones verifican su autenticación en el handler: JWT con `getUser`, secreto de RevenueCat o token de un solo uso del worker, respectivamente.

La migración local `20261003051749_deriva_initial.sql` coincide con la versión aplicada en el proyecto conectado. Su historial también contiene las migraciones del checador: evita reparar/eliminar versiones de ese historial desde Deriva. Para futuras migraciones compartidas, conserva el historial completo del proyecto.

## Verificación

```bash
npm run typecheck
npm run lint
npm test
npx expo install --check
npx expo-doctor
npx expo export --platform all
```

Las pruebas SQL están en `supabase/tests/deriva_rules.sql`: ejecútalas con una conexión SQL de administrador. Crean datos de prueba dentro de una transacción y terminan en `ROLLBACK`. No las ejecutes fragmentadas.

Resultado al 3 de octubre de 2026: **49 pruebas**, TypeScript, ESLint, compatibilidad de dependencias, 21/21 controles de Expo y bundles Android/iOS/web pasaron. Las tres funciones pasaron `deno check` y ocho comprobaciones de handlers con dependencias sustituidas. También pasaron la suite SQL en PostgreSQL 17 alojado y 16 comprobaciones con API real de Auth/Storage, permisos/RLS y eventos Realtime entre dos cuentas temporales. Las tres funciones están activas en versión 1 y el cron del worker responde HTTP 200 con cola vacía.

La vista previa web pasó las anchuras 320, 390, 768 y 1440 px sin desbordamientos ni errores de ejecución o consola. El recorrido web con sesión real pasó login, edición de perfil, preferencias, controles de acceso a cámara/compras, inbox y logout sin errores de página. Las dos cuentas, la fotografía y sus datos temporales de prueba se eliminaron; los datos originales de asistencia se conservaron.

La guía de [aceptación en dispositivos](docs/acceptance.md) distingue lo verificado en este equipo de los pasos que necesitan tu teléfono. La apertura en Expo Go y los sensores físicos aún deben observarse en el dispositivo. Para la fase posterior de tiendas/push quedan pendientes el proyecto EAS, las claves/productos RevenueCat, la firma nativa y las credenciales FCM/APNs. Los bundles no equivalen a una prueba de sensores físicos.

`npm audit` aún informa 23 entradas transitivas: 20 altas y 3 moderadas, derivadas de `braces`, `node-forge` y `decode-uri-component`. Se corrigió `uuid` con una versión compatible; forzar el resto mediante `npm audit fix --force` propone degradaciones incompatibles de Expo/React Native. Revisa actualizaciones compatibles antes de distribuir. El advisor de Supabase informa un WARN por protección de contraseñas filtradas desactivada, una configuración preexistente del Auth compartido que esta app conserva, y cuatro INFO por tablas privadas y cola sin políticas, deliberadamente inaccesibles a usuarios. [Protección de contraseñas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), [RLS sin políticas](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

## Estructura

- `src/app`: pantallas de Expo Router.
- `src/ui` y `src/maps`: interfaz y mapa OpenStreetMap/Leaflet.
- `src/domain`: geografía y reglas de publicación, sin dependencias nativas.
- `src/services`: sensores, fotos, sesión, datos, compras y notificaciones.
- `src/state`: integración y suscripciones con reconexión.
- `supabase`: migraciones, pruebas y funciones del servidor.

El mapa usa Leaflet 1.9.4 con comprobación de integridad y teselas de OpenStreetMap. Requiere conexión. La exploración incluye los 300 lugares más recientes y los guardados o notificaciones anteriores; para volúmenes mayores conviene paginar el mapa por región y usar un proveedor de teselas con capacidad adecuada.
