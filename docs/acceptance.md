# Aceptación de Deriva

La fase actual se prueba en **Expo Go para Android e iOS**. El usuario inicia el servidor. Exportar paquetes Android/iOS y revisar la interfaz auxiliar en navegador no demuestra la ejecución ni los sensores del teléfono.

## Cambios actuales

Interfaz negra, pins `?`, mapa inicial con permiso GPS, sin botón de ejemplos. Detalles con GPS/brújula arriba y título/foto debajo, sin descripciones ni enlaces externos. Publicación sin categorías y con errores visibles. Pago único de 1 USD por punto remoto en Stripe de prueba; rol administrador propio de Deriva. Perfil sin Guardados ni Premium.

## Verificación de software

Verificación del 4 de octubre de 2026:

| Comprobación | Resultado |
| --- | --- |
| TypeScript, ESLint y reglas de dominio/Stripe/sesión/mapas | Pasaron, 92/92 pruebas |
| Dependencias Expo | `expo install --check` correcto |
| Paquetes Android, iOS y web | Exportados sin abrir Expo Go ni iniciar un servidor de desarrollo |
| Interfaz auxiliar a 320, 390, 768 y 1440 px | Sin desbordamientos, errores de página/consola ni warnings de Supabase |
| Mapa auxiliar | Teselas reales oscuras, pins `?`, selección conserva documento; punto vacío ofrece 1 USD |
| Publicación con sesiones locales de prueba | 7 comprobaciones: CTA y errores título/foto, sin categorías, admin gratis, pago normal y retorno de login con coordenadas |
| Supabase alojado | Tres suites SQL pasaron con ROLLBACK; 2 usuarios, 3 lugares y 0 compras conservados; admin solicitado verificado |
| Edge Functions Stripe | Deno check correcto; endpoints v3 activos: Checkout sin sesión 401, webhook sin firma 400 y evento sintético firmado ajeno al pago 200/ignored |
| Stripe completo | Cuenta de prueba, precio, enlace y webhook provisionados; configuración real conservada tras SQL. Prueba con tarjeta desde el teléfono pendiente |
| Teléfono físico | Pendiente de probar en Expo Go iniciado por el usuario |

Evidencia local en `verification/dark-export`, `verification/dark-web`, `verification/publication-fixtures` y `verification/stripe-runtime-report.json`. `scripts/verify_publication.py` intercepta todas las solicitudes Supabase y WebSockets para probar la interfaz sin escribir datos reales ni simular una prueba de sensores físicos. Las tres suites SQL terminan en `ROLLBACK` y no usan pagos reales. La prueba sintética del webhook comprueba firma y recepción sin registrar créditos; no equivale a completar un pago con tarjeta. Expo puede estar iniciado por el usuario; la verificación no lo inicia ni lo detiene.

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
- [ ] Una firma incorrecta, ticket ajeno, importe alterado o evento real no concede crédito.
- [ ] Con Stripe de prueba configurado, completar Checkout con una tarjeta de prueba de Stripe; volver a Expo Go y esperar la confirmación del servidor.
- [ ] Cancelar Checkout no concede acceso. Abrir directamente la URL de retorno tampoco.
- [ ] Tras pagar, publicar una ubicación remota consume un solo crédito; un segundo punto requiere otro pago. Un crédito pendiente no provoca un cobro duplicado.
- [ ] Repetir el webhook o el envío de publicación no duplica créditos ni lugares. Un reembolso revoca el crédito disponible, incluso si llega antes del evento de pago.
- [ ] Cambiar de cuenta durante cámara, GPS o Checkout no traslada foto, borrador ni derechos a la cuenta nueva.

La verificación completa requiere abrir el Payment Link desde Expo Go; el ticket y la firma se validan en el backend mediante configuración privada y Supabase Vault. No se configuran claves reales ni se realizan cargos reales en esta fase. [Configuración](stripe-pruebas.md).

## Realtime y push

- [ ] Publicar con una cuenta y observar el lugar desde otra sin recargar.
- [ ] Confirmar un pago o cambiar el rol desde el servidor y observar la actualización; regresar al primer plano reconcilia los datos.
- [ ] Al abrir en un teléfono, observar el permiso de notificaciones cuando el sistema pueda solicitarlo; un permiso concedido o denegado definitivamente no genera otro diálogo.
- [ ] En Expo Go, guardar una zona normal y comprobar Actividad sin registrar tokens ni simular push.
- [ ] Con administrador, publicar un lugar propio y otro lejano: ambos deben aparecer una sola vez en Actividad, incluso sin preferencias.
- [ ] Con cuenta normal, comprobar avisos de otra cuenta dentro del radio guardado y ausencia de avisos propios o lejanos. El radio nuevo predeterminado es 10 km; los ya guardados se conservan.

Push remoto requiere una compilación propia, EAS y credenciales FCM/APNs. En esa fase, comprobar entrega visible en segundo plano, apertura del destino al tocarla, zona/radio y cierre de sesión. Un receipt de Expo confirma aceptación por APNs/FCM, no que una persona vio el aviso. [Notificaciones SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/).

La actualización de alertas pasó TypeScript, ESLint y 96 pruebas. La suite alojada `supabase/tests/deriva_admin_notifications.sql` verificó avisos globales del administrador, distancia y exclusión del autor normal, ausencia de duplicados y RLS; sus 14 entradas de cola de prueba se revirtieron con `ROLLBACK`. Se conservaron los cuatro lugares existentes y quedaron cero avisos, tokens o entradas de cola de fixtures. La exportación Android/iOS/web pasó en `verification/admin-notifications-export`. El diálogo de permisos y la entrega en un teléfono todavía requieren verificación física.

## Regreso de Stripe: aviso de montaje en Android

El usuario completó el pago de prueba y vio el aviso `Can't perform a React state update on a component that hasn't mounted yet` al regresar de Stripe. La consulta del backend confirmó que la compra de 100 centavos USD está `available`, sin consumir. Este aviso no anula el pago: debe usarse el crédito existente para terminar la publicación, sin volver a cobrarlo.

La pila `ContextNavigator → ExpoRoot` coincide con el [fallo de inicialización de enlaces de Expo Router #49378](https://github.com/expo/expo/issues/49378). La versión instalada y compatible con SDK 57, `expo-router 57.0.24`, todavía entrega el enlace inicial desde una promesa que empieza durante el render. Si resuelve antes de que el navegador se monte, intenta actualizar su estado demasiado pronto.

`scripts/patch-expo-router.cjs` corrige el componente de la dependencia: guarda la referencia del enlace inicial hasta su primer efecto, conserva los enlaces posteriores y descarta callbacks después del desmontaje. También evita restaurar un enlace inicial que el navegador ya atendió. El parche se aplica automáticamente en `postinstall`, es idempotente y falla si cambia la estructura que espera, para exigir revisión al actualizar Expo Router. No oculta mensajes de LogBox ni modifica el cobro o los créditos.

Las cinco pruebas nuevas ejecutan el componente compilado del SDK con ciclos de hooks controlados. Reproducen la escritura antes de montaje en el código original y comprueban que el parche la aplaza hasta el efecto; también cubren enlace síncrono, enlaces posteriores, resolución tardía tras desmontaje e idempotencia. Pasaron las cinco, TypeScript y ESLint; la suite completa pasó 92/92 pruebas y la exportación Android/iOS/web quedó en `verification/router-mount-export`. No sustituyen la comprobación del regreso real en Android.

Para que Metro abandone la copia de la dependencia que tenía en caché, el usuario debe detener su servidor de Expo en la terminal y reiniciarlo personalmente desde la carpeta `deriva`:

```sh
npm start -- --clear
```

Después, abrir Deriva en Expo Go y terminar el punto con el pago ya disponible. Falta confirmar en el teléfono que regresar de Stripe ya no produce el aviso. La corrección no inicia ni detiene el servidor de Expo del usuario.
