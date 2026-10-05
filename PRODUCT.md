# Deriva

Aplicación React Native y Expo para teléfonos Android e iOS. La fase actual se abre en **Expo Go**, sin generar APK. El usuario inicia Expo; el agente no lo inicia ni deja servidores de desarrollo activos. La variante web sirve solo para verificación auxiliar.

El mapa es la pantalla inicial y principal. Pide ubicación en primer plano y se centra en el GPS real; si falla, permite explorar SLRC sin fingir que esa es la ubicación del teléfono. Interfaz en español con fondo negro, controles simples y pins `?`.

## Publicación

- Publicar aquí es gratis: fotografía directa de cámara después de biometría, título y GPS actual.
- Tocar un punto vacío propone agregar un lugar por **1 USD por publicación**, con cámara o galería. No hay suscripción.
- El usuario eligió **Stripe en modo de prueba**, accesible desde Expo Go mediante Checkout en navegador. Solo el webhook firmado concede un crédito; la publicación lo consume atómicamente.
- La cuenta `lleonalmaza@gmail.com` debe tener rol de administrador exclusivo de Deriva para publicar puntos remotos gratis. El cliente no decide quién es administrador.
- No hay categorías. Los errores de validación se explican y el botón no permanece gris sin indicar el requisito pendiente.

## Exploración

Las fichas muestran foto y título. GPS y brújula son la acción principal arriba del detalle; no hay botones de navegación externa. Se conservan seis ejemplos locales de SLRC sin el botón «SLRC ejemplos» ni descripciones añadidas. Su procedencia permanece documentada, y no se insertan como publicaciones reales.

Tres pestañas: Mapa, Publicar y Perfil. Perfil no muestra Guardados ni Premium. Las pestañas usan navegación real sin transiciones laterales.

## Capacidades y límites

Cámara, GPS, magnetómetro y biometría se usan por separado; no se almacenan datos biométricos. Supabase aporta cuenta, base de datos, fotos privadas y Realtime. Push y Face ID requieren una compilación propia en una fase posterior; no se simulan como disponibles en Expo Go.

Las verificaciones de software y backend se registran por separado de la ejecución en teléfonos. Se conservan tablas, políticas y triggers del sistema de asistencia que comparte Supabase.

Para trabajar en este proyecto, el usuario prohibió utilizar skills de `.agents/skills`. Se pueden utilizar instrucciones y herramientas propias de Codex.
