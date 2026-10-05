# Aceptación de Deriva

La fase actual se prueba en **Expo Go para Android e iOS**. El usuario inicia el servidor. Exportar paquetes Android/iOS y revisar la interfaz auxiliar en navegador no demuestra la ejecución ni los sensores del teléfono.

## Cambios actuales

Interfaz negra, pins `?`, mapa inicial con permiso GPS, sin botón de ejemplos. Detalles con GPS/brújula arriba y título/foto debajo, sin descripciones ni enlaces externos. Publicación sin categorías y con errores visibles. Pago único de 1 USD por punto remoto en Stripe de prueba; rol administrador propio de Deriva. Perfil sin Guardados ni Premium.

## Verificación de software

Verificación del 4 de octubre de 2026:

| Comprobación | Resultado |
| --- | --- |
| TypeScript, ESLint y reglas de dominio/Stripe/sesión/mapas | Pasaron, 83/83 pruebas |
| Dependencias Expo | `expo install --check` correcto |
| Paquetes Android, iOS y web | Exportados sin abrir Expo Go ni iniciar un servidor de desarrollo |
| Interfaz auxiliar a 320, 390, 768 y 1440 px | Sin desbordamientos, errores de página/consola ni warnings de Supabase |
| Mapa auxiliar | Teselas reales oscuras, pins `?`, selección conserva documento; punto vacío ofrece 1 USD |
| Publicación con sesiones locales de prueba | 7 comprobaciones: CTA y errores título/foto, sin categorías, admin gratis, pago normal y retorno de login con coordenadas |
| Supabase alojado | Ambas suites SQL pasaron con ROLLBACK; admin solicitado asignado y verificado |
| Edge Functions Stripe | Deno check correcto; endpoints desplegados, sin sesión devuelve 401 y retorno no concede crédito |
| Stripe completo | Pendiente de secretos; webhook alojado devuelve 503 por configuración ausente |
| Teléfono físico | Pendiente de probar en Expo Go iniciado por el usuario |

Evidencia local en `verification/dark-export`, `verification/dark-web`, `verification/publication-fixtures` y `verification/stripe-runtime-report.json`. `scripts/verify_publication.py` intercepta todas las solicitudes Supabase y WebSockets para probar la interfaz sin escribir datos reales ni simular una prueba de sensores físicos. Las suites SQL terminan en `ROLLBACK` y no usan pagos reales.

Las comprobaciones anteriores al cambio de modelo pasaron TypeScript, ESLint, 65 pruebas y paquetes Android/iOS/web. Se había verificado Storage, RLS, Auth, Realtime y el worker de push. Esos resultados son historial; las suscripciones Premium anteriores ya no autorizan publicaciones remotas.

## Prueba en teléfono

Registrar modelo, sistema y versión de Expo Go junto con cada resultado.

- [ ] Abrir desde el QR iniciado por el usuario: aparece el mapa y se solicita ubicación en primer plano.
- [ ] Con permiso, el mapa se centra en el teléfono. Si se rechaza o el GPS está apagado, se puede explorar y reintentar sin simular la posición.
- [ ] Ver cartografía oscura y pins `?`; no confundir el fondo oscuro con teselas que no cargan. Probar gestos y recarga tras perder internet.
- [ ] Navegar entre las tres pestañas sin desplazamiento lateral. Perfil no muestra Guardados ni Premium.
- [ ] Abrir un punto: título y foto, con Activar GPS y brújula arriba; sin categorías, descripciones de muestra ni enlaces de navegación externa.
- [ ] Activar brújula con el teléfono plano: cambia al girarlo y la distancia depende del GPS. Probar también en un ejemplo de SLRC.
- [ ] Probar texto ampliado y TalkBack/VoiceOver; los botones deben seguir siendo accesibles.

## Publicación gratuita

- [ ] Iniciar sesión, escribir título y tomar foto. La biometría se solicita antes de abrir la cámara; cancelar no omite el requisito.
- [ ] El botón Publicar lugar se puede pulsar sin quedar gris por campos pendientes. Título demasiado corto, falta de foto o permisos rechazados muestran el motivo concreto.
- [ ] Con título válido y foto, publicar solicita GPS fresco y guarda el lugar en la posición actual. No requiere Stripe ni pago.
- [ ] GPS impreciso, simulado o no disponible informa del problema y no crea una publicación.
- [ ] Perder conexión y reintentar produce un único lugar. Editar el borrador inicia una nueva petición.
- [ ] No aparecen categorías ni un botón de galería que permita saltar las reglas del modo gratuito.

Android necesita huella compatible con autenticación fuerte. iOS Expo Go admite Touch ID, pero **no Face ID**; un iPhone con solo Face ID puede explorar y el flujo de cámara informa de la limitación. No se acepta PIN como sustituto. [Biometría SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/local-authentication/).

## Administrador y Stripe de prueba

- [ ] Iniciar sesión con `lleonalmaza@gmail.com`: Perfil muestra Administrador.
- [ ] Tocar un espacio vacío como administrador: ofrece agregar gratis; permite foto de galería y publica en el punto sin consumir pagos.
- [ ] Con otra cuenta, tocar un espacio vacío: aparece el precio **1 USD por publicación**, antes de abrir Checkout.
- [ ] Sin configurar Stripe, se muestra el error del servidor y no se concede ningún crédito. La publicación local sigue disponible.
- [ ] Con secretos de prueba y webhook configurados, completar Checkout con una tarjeta de prueba de Stripe; volver a Expo Go y esperar la confirmación del servidor.
- [ ] Cancelar Checkout no concede acceso. Abrir directamente la URL de retorno tampoco.
- [ ] Tras pagar, publicar una ubicación remota consume un solo crédito; un segundo punto requiere otro pago. Un crédito pendiente no provoca un cobro duplicado.
- [ ] Repetir el webhook o el envío de publicación no duplica créditos ni lugares. Un reembolso revoca el crédito disponible, incluso si llega antes del evento de pago.
- [ ] Cambiar de cuenta durante cámara, GPS o Checkout no traslada foto, borrador ni derechos a la cuenta nueva.

La verificación completa de Checkout requiere `DERIVA_STRIPE_TEST_SECRET_KEY` y `DERIVA_STRIPE_WEBHOOK_SECRET` en Supabase. No se configuran claves reales ni se realizan cargos reales en esta fase. [Configuración](../README.md#configurar-stripe-de-prueba).

## Realtime y push

- [ ] Publicar con una cuenta y observar el lugar desde otra sin recargar.
- [ ] Confirmar un pago o cambiar el rol desde el servidor y observar la actualización; regresar al primer plano reconcilia los datos.
- [ ] En Expo Go, comprobar Actividad con una cuenta cuya zona ya exista. Activar push informa de la limitación sin registrar tokens ni simular avisos.

Push remoto requiere una compilación propia, EAS y credenciales FCM/APNs. En esa fase, comprobar entrega visible en segundo plano, apertura del destino al tocarla, zona/radio y cierre de sesión. Un receipt de Expo confirma aceptación por APNs/FCM, no que una persona vio el aviso. [Notificaciones SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/).
