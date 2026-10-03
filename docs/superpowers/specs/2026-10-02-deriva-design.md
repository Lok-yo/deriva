# Deriva

Aplicación React Native con Expo SDK 57, Android e iOS, interfaz en español. El usuario autorizó la implementación autónoma completa y confirmó el nombre y ambas plataformas.

## Experiencia

Mapa de lugares compartidos, filtros por título y categoría, selección aleatoria entre lugares cercanos y una brújula hacia el destino. Los visitantes pueden ver ejemplos marcados como vista previa; los datos reales requieren una cuenta. Publicación con título, fotografía y coordenadas. Guardados, notificaciones y perfil completan la navegación.

El plan gratuito publica desde una lectura actual del GPS y una foto de cámara precedida de autenticación biométrica sin alternativa de PIN. Premium permite seleccionar coordenadas en el mapa y fotografías de la galería. La brújula usa el magnetómetro, de modo que cámara, GPS, magnetómetro y biometría son funciones independientes y visibles.

## Backend

Usar el proyecto Supabase conectado, conservando sus tablas de asistencia. Nuevas tablas/RPC con prefijo `deriva_`, esquema privado `deriva_private` y bucket privado `deriva-photos`. Auth comparte el proyecto: el trigger existente crea también un perfil de asistencia durante signup y requiere `full_name`; Deriva lo suministra, sin modificar el trigger.

RLS aísla cuentas, guardados, tokens, preferencias y notificaciones. Los lugares son visibles para usuarios autenticados. Solo una RPC crea lugares, verifica la suscripción desde la tabla de derechos protegida y valida coordenadas, precisión y antigüedad del GPS, origen declarado y biometría declarada. Expo no ofrece prueba criptográfica de GPS/cámara/biometría contra un cliente modificado; esa limitación se documenta. Las fotos se comprimen a JPEG, sin EXIF, y se leen con URL firmada.

## Pagos y alertas

RevenueCat coordina compras de las tiendas, restaura compras y usa el UUID de Supabase como identidad. El servidor consulta RevenueCat antes de otorgar `deriva_premium`; ninguna bandera local habilita Premium real. El webhook autentica un secreto y vuelve a consultar el estado actual para evitar confiar en eventos antiguos.

Las publicaciones generan notificaciones cerca de la zona elegida por cada usuario. Realtime mantiene lugares, derechos e inbox. Una cola durable entrega push mediante Expo; un worker privado ejecutado por cron reintenta errores transitorios, consulta receipts y elimina tokens inválidos. Los permisos se solicitan cuando la persona activa cada función, sin rastreo de ubicación en segundo plano.

## Validación

Pruebas de reglas geográficas y Premium; pruebas SQL transaccionales de RLS, publicación, aislamiento, idempotencia y cola; TypeScript; configuración de Expo; bundles Android/iOS/web; recorrido web y capturas de la interfaz. Compras de sandbox, entrega al teléfono y aceptación de sensores requieren dispositivos y credenciales externas. Las claves de RevenueCat, las credenciales FCM/APNs y el proyecto EAS se configuran en sus cuentas; no se inventan.
