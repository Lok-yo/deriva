# Aceptación de Deriva

La prueba actual se realiza en **Expo Go en el teléfono**, siguiendo la [guía de apertura](../README.md#abrir-en-expo-go). La implementación pasó las comprobaciones de software y del backend conectado; la apertura y los sensores aún deben observarse en el dispositivo. Registra dispositivo, versión de Expo Go, versión del sistema y resultado de cada paso.

## Alcance de Expo Go

| Función | Prueba actual |
| --- | --- |
| Mapa, cuenta, datos y Realtime | Android Expo Go usa Leaflet/OpenStreetMap en WebView; iOS conserva Apple Maps |
| GPS y magnetómetro | Probar con el hardware y permisos del teléfono |
| Cámara con biometría | Huella en Android o Touch ID en iPhone compatible; no aceptar PIN ni omitir la autenticación |
| Face ID en iOS | No disponible en Expo Go; requiere una compilación propia en una fase posterior |
| Compras reales | Deriva las bloquea en Expo Go; no conceder Premium por una compra simulada |
| Push remoto | Deriva no registra tokens ni activa ese flujo de zona en Expo Go. El inbox requiere una cuenta con zona de alertas ya configurada |

La limitación de Face ID está documentada por [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/local-authentication/). Expo tampoco ofrece push remoto en Expo Go para Android desde SDK 53; la app mantiene esta integración desactivada en Expo Go para ambas plataformas. [Notificaciones SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/).

## Correcciones para Android Expo Go

| Comprobación | Resultado |
| --- | --- |
| `npm run check` | TypeScript, ESLint y 65/65 pruebas pasaron |
| Exportación de paquetes Android/iOS/web | Pasó; no genera APK/IPA ni abre Expo Go |
| Documento del mapa integrado con bridge nativo sustituido en navegador | Teselas reales cargadas al abrir SLRC y al centrar la posición de prueba; selección y actualizaciones pasaron |
| Rutas y tamaños sobre archivos exportados, sin servidor | Pasaron sin desbordamientos, errores de consola ni avisos de Supabase |
| Arranque del cliente Supabase | Aviso de `lock` ausente; almacenamiento nativo sustituido en memoria; acceso anónimo a perfiles bloqueado como corresponde |
| Servidor de desarrollo | Detenido; el usuario lo inicia |
| Variante del mapa, GPS y transiciones en Android físico | Pendientes de confirmación en Expo Go |

## Resultados del rediseño inicial

| Comprobación | Resultado |
| --- | --- |
| `npm run check` | TypeScript, ESLint y 61/61 pruebas pasaron |
| Compatibilidad de dependencias / Expo Doctor | `expo install --check` correcto; 21/21 controles de Expo |
| Servidor para Expo Go SDK 57 | Manifiestos y paquetes Android/iOS descargados; no son APK/IPA ni una prueba física |
| Navegador auxiliar a 320, 390, 768 y 1440 px | Rutas, encuadre de los seis ejemplos de SLRC, selección sin reiniciar el mapa, Al azar, detalles de ejemplos y formularios pasaron sin desbordamientos ni errores de consola |
| Revisión visual auxiliar | Mapa a 320/390 px y Perfil a 390 px revisados; composición simplificada coherente |
| Apertura, mapa nativo, permiso inicial, GPS y gestos en teléfono | Pendientes de prueba con Expo Go |

Las comprobaciones del navegador cubren únicamente la variante auxiliar. No demuestran el proveedor nativo del mapa, el permiso del sistema ni la ubicación física del teléfono.

## Resultados previos al rediseño, 3 de octubre de 2026

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

## Mapa principal del rediseño

Los resultados anteriores son historial. El usuario observó el mapa negro en Android; la variante actual de Android Expo Go evita el motor Google mediante Leaflet/OpenStreetMap en WebView. El síntoma coincide con el [reporte de Expo SDK 57](https://github.com/expo/expo/issues/49323), pero falta observar la corrección en el teléfono. iOS conserva `react-native-maps`. La aceptación siguiente se registra desde Expo Go, con modelo de teléfono y plataforma; el usuario inicia el servidor.

- [ ] Abrir sin cuenta: se ve directamente el mapa y se solicita permiso de ubicación en primer plano.
- [ ] Conceder permiso: el mapa se centra en el GPS real y el punto de ubicación coincide con el teléfono.
- [ ] Rechazar permiso: se puede explorar SLRC; la app ofrece una recuperación y no identifica SLRC como el GPS del usuario.
- [ ] Desactivar los servicios de ubicación: se puede seguir explorando y el control de ubicación informa del problema sin simular una lectura.
- [ ] Mover y ampliar el mapa: responde a los gestos y no recentra continuamente. El botón de ubicación vuelve al GPS actual.
- [ ] Ver ejemplos de SLRC identificados como ejemplos; sus marcadores no aparecen como usuarios o publicaciones reales.
- [ ] Tocar un marcador: aparece una ficha compacta con título, metadatos y acceso al detalle. La acción abre el detalle correcto y regresar conserva el mapa.
- [ ] Navegar por Mapa, Publicar y Perfil sin animación lateral. Guardados y Actividad se abren desde Perfil, y el regreso vuelve a la pestaña anterior.
- [ ] Comprobar legibilidad con tamaño de texto aumentado, VoiceOver/TalkBack y controles fuera de la barra de estado e indicador de inicio.

## Teléfono con plan gratuito

- [ ] Iniciar `npm start`, escanear el QR con Expo Go, crear cuenta y confirmar correo si Supabase lo requiere.
- [ ] Rechazar permiso de GPS: se permite explorar y no se publica. Con permiso, el mapa centra tu ubicación y usa la precisión real.
- [ ] Configurar huella en Android o Touch ID en iPhone compatible. Pulsar cámara: aparece el diálogo biométrico antes de abrir la cámara. Cancelarlo no abre la cámara. No se acepta PIN como sustituto.
- [ ] En un iPhone que solo ofrece Face ID, pulsar cámara informa de la limitación de Expo Go y permite seguir explorando; no abre la cámara sin autenticar.
- [ ] Tomar una fotografía y publicar un título. El lugar aparece con coordenadas actuales y fotografía JPEG.
- [ ] Galería y elección de punto remoto conducen a Premium; no conceden acceso al plan gratuito.
- [ ] Activar brújula en un destino. Con el teléfono plano y lejos de metal, girarlo cambia el rumbo; el texto identifica rumbo magnético y la distancia proviene del GPS.
- [ ] Perder la conexión al publicar y reintentar: el mismo UUID produce un solo lugar. Si se cambia foto o borrador, comienza una nueva petición.
- [ ] Denegar cámara/biometría, carecer de hardware o no tener biometría registrada produce errores claros, sin simular éxito.

## Pagos de sandbox, fase posterior

Estas comprobaciones requieren una compilación propia y la configuración de RevenueCat/tiendas; quedan fuera de la prueba actual en Expo Go.

- [ ] Configurar productos, offering current y entitlement `deriva_premium` en RevenueCat para ambas tiendas.
- [ ] Comprar en sandbox. El precio mostrado coincide con la tienda y Premium se activa únicamente al verificar el servidor.
- [ ] Usar galería y elegir un punto remoto en el mapa; ambos se publican correctamente.
- [ ] Restaurar desde otra instalación de la misma cuenta. Cancelar una compra no cambia derechos.
- [ ] Simular expiración/reembolso. El webhook actualiza Supabase y otro dispositivo refleja el cambio mediante Realtime.
- [ ] Comprobar que cambiar user_metadata o escribir directamente a entitlements no permite obtener Premium.

## Realtime y push

- [ ] Abrir dos cuentas distintas. Publicar con una y observar el lugar nuevo en la otra sin recargar.
- [ ] En Expo Go, con una cuenta cuya zona ya esté configurada, comprobar los avisos de Actividad en tiempo real con la app abierta. Intentar activar push muestra su limitación sin registrar un token, configurar una zona nueva ni simular una entrega.

Los siguientes pasos de push se realizan posteriormente con una compilación propia y FCM/APNs configurados:

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

Para abrir la app ahora solo necesitas Expo Go compatible con SDK 57 y acceso al servidor por la misma red o túnel. Para comprobar la publicación gratuita, el teléfono necesita cámara, GPS y biometría admitida por Expo Go; la brújula requiere magnetómetro. Las cuentas de Expo/RevenueCat, productos de tiendas y FCM/APNs corresponden a la [fase nativa posterior](../README.md#desarrollo-nativo-posterior). La aceptación física queda pendiente hasta observar esas pruebas.
