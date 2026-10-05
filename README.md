# Deriva

Aplicación móvil React Native + Expo para Android e iOS. Abre directamente el mapa, solicita ubicación y se centra en el GPS cuando concedes permiso. Interfaz negra, marcadores `?` y tres pestañas: **Mapa**, **Publicar** y **Perfil**.

## Abrir en Expo Go

El usuario inicia Expo; las verificaciones del proyecto no necesitan abrirlo ni dejar un servidor activo.

```bash
cd /home/kiyo/Proyectos/Aurelio/deriva
npm start -- --clear
```

Usa Expo Go compatible con SDK 57, conecta el teléfono a la misma red del equipo y escanea el QR. Si tu red bloquea la conexión, puedes usar `npm run start:tunnel`. No necesitas generar un APK. En otro equipo ejecuta primero `npm ci`.

El `.env` local contiene la URL y clave publishable de Supabase y está excluido de Git. Para otro equipo usa `.env.example`. Las claves privadas de Stripe pertenecen exclusivamente a los secretos de Edge Functions.

## Publicar

| Flujo | Fotografía | Ubicación | Precio |
| --- | --- | --- | --- |
| Publicar aquí | Cámara después de biometría | GPS actual | Gratis |
| Tocar un punto vacío del mapa | Cámara o galería | Punto seleccionado | 1 USD por publicación |
| Administrador de Deriva | Cámara o galería | Punto seleccionado | Gratis |

No hay suscripción Premium ni categorías en el formulario. Una publicación necesita título de 3 a 80 caracteres y fotografía. Al publicar gratis se obtiene una lectura GPS fresca; los requisitos pendientes se muestran como mensajes y el botón solo se bloquea durante una operación. El servidor comprueba precisión de hasta 100 m, antigüedad de hasta dos minutos, proximidad y origen de la foto.

Tocar un espacio vacío muestra el precio antes de continuar al formulario. **Stripe funciona exclusivamente en modo de prueba**: Checkout se abre en el navegador del teléfono y después regresas a Expo Go. Un webhook firmado confirma el pago; regresar desde Stripe por sí solo no concede acceso. Un pago habilita exactamente una publicación remota. Si ya tienes un pago disponible, se utiliza sin solicitar otro; los reintentos conservan su identificador para no duplicar publicaciones ni consumos.

El rol de administrador de `lleonalmaza@gmail.com` ya está asignado y verificado. Se guarda en una tabla exclusiva de Deriva. Los usuarios no pueden concedérselo mediante su perfil, correo editable o metadatos. No otorga administración del proyecto Supabase ni del sistema de asistencia compartido.

## Configurar Stripe de prueba

La integración necesita dos secretos del servidor, configurados en [Edge Functions de Supabase](https://supabase.com/dashboard/project/kqabddlasmvipuskvnvr/functions/secrets):

- `DERIVA_STRIPE_TEST_SECRET_KEY`: clave `sk_test_…` de tu cuenta Stripe.
- `DERIVA_STRIPE_WEBHOOK_SECRET`: secreto `whsec_…` del endpoint de prueba.

Crea un destino de eventos de prueba en Stripe con esta dirección:

```text
https://kqabddlasmvipuskvnvr.supabase.co/functions/v1/deriva-stripe-webhook
```

Activa `checkout.session.completed`, `checkout.session.async_payment_succeeded` y `charge.refunded`. La integración usa la versión de API indicada en `supabase/functions/_shared/stripe.ts`. No requiere crear un producto manualmente: el servidor fija el importe en 100 centavos USD. Rechaza claves y eventos de modo real.

Hasta configurar esos secretos, el flujo muestra un error claro y no concede publicaciones pagadas. La publicación local y el acceso del administrador funcionan sin Stripe. Consulta la [guía del backend](supabase/README.md) para despliegue y pruebas. [Documentación oficial de Checkout](https://docs.stripe.com/checkout/quickstart), [confirmación mediante webhook](https://docs.stripe.com/checkout/fulfillment).

## Mapa y sensores

Android en Expo Go conserva Leaflet/OpenStreetMap dentro del WebView para evitar el [mapa negro reportado con SDK 57](https://github.com/expo/expo/issues/49323). iOS y las compilaciones propias usan `react-native-maps`. La cartografía necesita internet. Seleccionar puntos y recibir eventos no reconstruye el mapa ni lo recentra continuamente.

La ficha muestra título y foto. Arriba está **Activar GPS y brújula**, que utiliza el magnetómetro y la posición real también en los ejemplos. Las pestañas no tienen deslizamiento lateral. Perfil conserva cuenta, alertas y actividad; ya no contiene Guardados ni Premium.

Cámara, GPS, magnetómetro y biometría son capacidades independientes. No se almacenan huellas ni imágenes de Face ID. El flujo oficial exige biometría antes de abrir la cámara; la evidencia enviada al backend no es una atestación criptográfica del hardware.

En Android Expo Go se puede probar la huella. **Face ID no está disponible en Expo Go**; Touch ID funciona en dispositivos compatibles. Los sensores y permisos físicos necesitan comprobarse en el teléfono. [Biometría SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/local-authentication/).

## Ejemplos de SLRC

Se conservan seis puntos locales sin botón especial ni descripciones en la ficha. No se insertan en Supabase y nunca sustituyen el GPS. Sus fotografías son ilustrativas; las coordenadas aproximan los parques, no sus entradas ni rutas verificadas.

| Lugar | Coordenadas | Fuente |
| --- | --- | --- |
| Bosque de la Ciudad | 32.4452716, -114.7894500 | [OpenStreetMap](https://www.openstreetmap.org/way/233564759) |
| Plaza Benito Juárez | 32.4800748, -114.7804175 | [OpenStreetMap](https://www.openstreetmap.org/way/233567470) |
| Parque Solidaridad | 32.4525674, -114.8043819 | [OpenStreetMap](https://www.openstreetmap.org/way/233744892) |
| Parque La Tortuga | 32.4327620, -114.7571808 | [OpenStreetMap](https://www.openstreetmap.org/way/253208952) |
| Parque Yoreme | 32.4634193, -114.7408790 | [OpenStreetMap](https://www.openstreetmap.org/way/233669476) |
| Parque Emiliano Zapata | 32.4671593, -114.8019795 | [OpenStreetMap](https://www.openstreetmap.org/way/242092411) |

## Supabase, Realtime y push

El proyecto conectado es `kqabddlasmvipuskvnvr`. Deriva usa tablas `deriva_*`, esquema `deriva_private` y bucket privado `deriva-photos`. Auth se comparte con asistencia; se conserva su trigger y el registro envía `full_name` de 2 a 60 caracteres. Para aislar también las cuentas sería necesario otro proyecto.

RLS protege roles, compras, guardados, inbox, preferencias y tokens. El límite es de 20 publicaciones diarias por cuenta. Las fotos se convierten a JPEG sin EXIF y se leen mediante URLs firmadas de una hora. Realtime actualiza lugares, avisos, roles y pagos; al volver al primer plano se reconcilia el estado con el servidor.

Los módulos antiguos de RevenueCat se conservan en el historial/backend por compatibilidad, pero sus entitlements **ya no autorizan ubicaciones remotas**. La app usa el pago por punto. No configures RevenueCat para este flujo.

Push remoto sigue pendiente de una compilación propia, proyecto EAS y credenciales FCM/APNs. Deriva no registra tokens push dentro de Expo Go. Actividad muestra avisos de cuentas cuya zona ya esté configurada. Esto no afecta al pago de prueba, que usa el navegador. [Notificaciones SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/).

El worker `deriva-push-worker` procesa la cola y consulta receipts. Su cron usa tokens de un solo uso; no modifiques trabajos ni funciones de asistencia. Configuración de push y SQL en la [guía del backend](supabase/README.md).

## Verificación sin iniciar Expo

```bash
npm run check
npx expo export --platform all --output-dir verification/dark-export
verification/web-venv/bin/python scripts/verify_web.py --static-directory verification/dark-export --output verification/dark-web
verification/web-venv/bin/python scripts/verify_publication.py --static-directory verification/dark-export
```

Los comandos Python requieren el entorno local de Playwright; es una comprobación auxiliar de archivos exportados, no una entrega web ni una prueba de sensores nativos. Las suites SQL se ejecutan completas y terminan con `ROLLBACK`; no las ejecutes fragmentadas.

Los resultados actuales y la aceptación física pendiente están en [docs/acceptance.md](docs/acceptance.md). Los bundles Android/iOS no equivalen a observar la app en un teléfono.

## Estructura

- `src/app`: pantallas de Expo Router.
- `src/ui`, `src/maps`: interfaz y variantes del mapa.
- `src/domain`: reglas de publicación, pagos y geografía.
- `src/services`, `src/state`: sensores, cuenta, datos, Checkout y sincronización.
- `supabase`: migraciones, funciones y pruebas del servidor.

[PRODUCT.md](PRODUCT.md) registra el alcance y [DESIGN.md](DESIGN.md) las decisiones visuales.
