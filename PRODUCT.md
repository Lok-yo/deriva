# Deriva

Aplicación React Native y Expo para teléfonos Android e iOS. Se puede revisar en Expo Go o instalar el APK del perfil `preview`. La variante web sirve solo para verificación auxiliar.

El mapa es la pantalla inicial y principal. Pide ubicación en primer plano y se centra en el GPS real; si falla, permite explorar SLRC sin fingir que esa es la ubicación del teléfono. Interfaz en español con fondo negro, controles simples y pins `?`.

## Publicación

- Publicar aquí es gratis: fotografía directa de cámara después de biometría, título y GPS actual.
- Tocar un punto vacío propone agregar un lugar por **1 USD por publicación**, con cámara o galería, solo después de visitar 3 lugares. Antes muestra el progreso y lleva a Exploración. No hay suscripción.
- Stripe está en modo de prueba y se abre en el navegador. Solo el webhook firmado concede un crédito; la publicación lo consume atómicamente.
- Una cuenta con rol de administrador de Deriva publica puntos remotos gratis. Ese rol se asigna en el servidor. El cliente no puede concedérselo.
- No hay categorías. Los errores de validación se explican y el botón no permanece gris sin indicar el requisito pendiente.

## Exploración

Las ubicaciones de pago se ganan explorando: hay que llegar en persona (GPS real, menos de 100 m) a 3 lugares de otras personas o ejemplos de SLRC. El servidor verifica cada llegada; abrir una ficha no cuenta y las publicaciones propias tampoco. Las visitas son por cuenta y no caducan. Completar la tercera envía un aviso a Actividad.

Las fichas muestran foto y título. GPS y brújula son la acción principal arriba del detalle; no hay botones de navegación externa. Se conservan seis ejemplos locales de SLRC sin el botón «SLRC ejemplos» ni descripciones añadidas. Su procedencia permanece documentada, y no se insertan como publicaciones reales.

Tres pestañas: Mapa, Publicar y Perfil. Perfil no muestra Guardados ni Premium. Las pestañas usan navegación real sin transiciones laterales.

## Capacidades y límites

Cámara, GPS, magnetómetro y biometría se usan por separado; no se almacenan datos biométricos. Supabase aporta cuenta, base de datos, fotos privadas y Realtime. Push y Face ID requieren una compilación propia en una fase posterior; no se simulan como disponibles en Expo Go.

Las verificaciones de software y backend se registran por separado de la ejecución en teléfonos. Las migraciones no reemplazan tablas, políticas ni triggers que ya existan en el proyecto de Supabase.
