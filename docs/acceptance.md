# Aceptación de Deriva

La implementación pasó las comprobaciones de software y del backend conectado. La aceptación de sensores físicos, compras y push visible requiere un teléfono y las cuentas externas. Registra dispositivo, versión del sistema y resultado de cada paso.

## Resultados comprobados, 3 de octubre de 2026

| Comprobación | Resultado |
| --- | --- |
| Dominio, pagos del servidor, push y cambios de cuenta | 49 pruebas pasaron |
| TypeScript / ESLint / dependencias Expo / Expo Doctor | Pasaron; 21/21 controles de Expo |
| Bundles JavaScript/Hermes Android, iOS y web | Los tres se generaron correctamente |
| Vista previa web a 320, 390, 768 y 1440 px | Sin desbordamientos ni errores de ejecución/consola |
| Recorrido web con sesión real | Login, perfil, preferencias, controles de cámara/compras, inbox y logout pasaron sin errores de página |
| Edge Functions en Deno | Tres checks pasaron; ocho comprobaciones de handlers con dependencias sustituidas |
| Reglas SQL en PostgreSQL 17 alojado | Suite transaccional pasó; `ROLLBACK` conservó también el endpoint y cron previos |
| Auth, Storage, permisos y RLS mediante API real | 16 comprobaciones pasaron con dos cuentas: subida JPEG, firmas, propiedad y bloqueos de acceso |
| Realtime entre dos cuentas | Recibidos eventos reales de publicación y aviso próximo |
| Funciones desplegadas y cron | Tres activas en versión 1; `deriva-push` cada minuto y worker autenticado HTTP 200 con cola vacía |
| Sensores físicos, compra de tienda y push visible | Pendientes de teléfono y credenciales |

Las pruebas de API enviaron evidencia de sensores declarada por el cliente; no tomaron fotografías ni usaron biometría/GPS físicos. Las dos cuentas, la fotografía y sus datos temporales de prueba se eliminaron; los datos originales de asistencia se conservaron. Un receipt correcto del push confirma aceptación por APNs/FCM; la entrega visible debe observarse en el teléfono.

## Teléfono con plan gratuito

- [ ] Instalar la compilación de desarrollo Android/iOS, crear cuenta y confirmar correo si Supabase lo requiere.
- [ ] Rechazar permiso de GPS: aparece una explicación y no se publica. Con permiso, el mapa centra tu ubicación y muestra precisión real.
- [ ] Configurar huella/Face ID. Pulsar cámara: aparece el diálogo biométrico antes de abrir la cámara. Cancelarlo no abre la cámara. No se acepta PIN como sustituto.
- [ ] Tomar una fotografía y publicar un título. El lugar aparece con coordenadas actuales y fotografía JPEG.
- [ ] Galería y elección de punto remoto conducen a Premium; no conceden acceso al plan gratuito.
- [ ] Activar brújula en un destino. Con el teléfono plano y lejos de metal, girarlo cambia el rumbo; el texto identifica rumbo magnético y la distancia proviene del GPS.
- [ ] Perder la conexión al publicar y reintentar: el mismo UUID produce un solo lugar. Si se cambia foto o borrador, comienza una nueva petición.
- [ ] Denegar cámara/biometría, carecer de hardware o no tener biometría registrada produce errores claros, sin simular éxito.

## Pagos de sandbox

- [ ] Configurar productos, offering current y entitlement `deriva_premium` en RevenueCat para ambas tiendas.
- [ ] Comprar en sandbox. El precio mostrado coincide con la tienda y Premium se activa únicamente al verificar el servidor.
- [ ] Usar galería y elegir un punto remoto en el mapa; ambos se publican correctamente.
- [ ] Restaurar desde otra instalación de la misma cuenta. Cancelar una compra no cambia derechos.
- [ ] Simular expiración/reembolso. El webhook actualiza Supabase y otro dispositivo refleja el cambio mediante Realtime.
- [ ] Comprobar que cambiar user_metadata o escribir directamente a entitlements no permite obtener Premium.

## Realtime y push

- [ ] Abrir dos cuentas distintas. Publicar con una y observar el lugar nuevo en la otra sin recargar.
- [ ] Activar alertas en una zona de 5 km con un teléfono y dejar la app en segundo plano.
- [ ] Publicar un lugar en la zona desde otra cuenta: inbox en tiempo real y push visible en el dispositivo. Registrar el receipt de aceptación de APNs/FCM y observar la notificación en el teléfono.
- [ ] Tocar el push abre el lugar correcto, incluso al iniciar la app desde cerrada.
- [ ] Publicar fuera del radio o desde la misma cuenta: no enviar alertas propias/fuera de zona.
- [ ] Desactivar alertas y cerrar sesión: no se conserva el token asociado a esa sesión después de confirmar la operación con conexión.
- [ ] Volver a iniciar sesión con alertas activas: el teléfono vuelve a registrarse con el permiso existente y recibe un nuevo aviso.
- [ ] Cambiar de cuenta durante permisos/GPS/compras: una operación pendiente no escribe ni concede Premium a la cuenta nueva. Un toque de push abre una sola pantalla.
- [ ] Rechazar permisos push permite seguir explorando; la app explica cómo activarlos.

## Condiciones externas

Todavía faltan el inicio de sesión/proyecto EAS y `EXPO_PUBLIC_EAS_PROJECT_ID`, claves públicas de RevenueCat para Android/iOS, productos/offering/entitlement, secretos de pagos del backend, firma Android/iOS y credenciales FCM/APNs. No había un teléfono conectado mediante ADB durante esta verificación.

Se necesitan un teléfono con biometría, cámara, GPS y magnetómetro; cuentas de Expo y RevenueCat; productos/sandbox de Google Play y App Store; credenciales FCM/APNs. La guía principal describe su [configuración](../README.md#instalar-en-android-o-ios). La aceptación física queda pendiente hasta observar esas pruebas.
