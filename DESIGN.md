# Diseño de Deriva

La dirección del rediseño responde a la petición de simplificar la app y hacer del mapa su pantalla principal. Las decisiones visuales siguientes son elecciones de implementación; la autoridad sobre propósito y restricciones está en [PRODUCT.md](PRODUCT.md).

## Pantalla de entrada

El mapa ocupa el espacio útil del teléfono desde el primer render. No hay bienvenida, hero, métricas, cuadrícula de tarjetas ni lista de lugares encima del mapa. Con permiso de ubicación se centra en el GPS real; si no hay permiso o falla la lectura, conserva una región exploratoria de SLRC y explica cómo reintentar, sin presentarla como la ubicación del usuario.

Controles pequeños en número y claros en función: **SLRC · Ejemplos** enfoca los parques de muestra, **Al azar** elige un destino y el botón de ubicación vuelve al GPS. No hay buscador, filtros ni lista en la entrada. Al tocar un marcador aparece una única ficha compacta con título, indicador de ejemplo o distancia y acceso al detalle; puede cerrarse sin abandonar el mapa.

## Navegación y jerarquía

Tres destinos principales en la barra inferior: **Mapa**, **Publicar** y **Perfil**. Guardados, Actividad y Premium se abren desde Perfil; editar nombre, alertas y publicaciones propias aparecen al desplegar su sección. Detalles y cuenta usan la pila de Expo Router y conservan el regreso del sistema. Publicar presenta únicamente las decisiones necesarias para crear el punto; las reglas de acceso no se simplifican.

## Lenguaje visual

Interfaz operativa con tipografía sans del sistema, títulos breves y tamaño contenido. Fondos claros y superficies discretas dejan la información geográfica como foco. Un acento verde identifica acciones y selección; los estados incluyen texto o iconos además del color. La ficha de lugar es compacta y los controles no se multiplican en paneles decorativos.

Usar tokens compartidos para color, tipo, espaciado y radios. Mantener el ajuste de tamaño de fuente del sistema, etiquetas accesibles y objetivos táctiles de al menos 48 × 48 en controles principales. Aplicar safe areas e insets del teclado; no colocar acciones bajo la barra de estado o el indicador de inicio.

## Comportamiento nativo

Android dentro de Expo Go usa Leaflet/OpenStreetMap dentro del WebView para evitar el [fallo del mapa negro en SDK 57](https://github.com/expo/expo/issues/49323). El documento permanece estable al seleccionar o actualizar lugares, usa un bridge validado y conserva atribución, estado de carga y recuperación. iOS y las compilaciones propias mantienen `react-native-maps`. [Mapas en Expo](https://docs.expo.dev/versions/v57.0.0/sdk/map-view/), [WebView en Expo](https://docs.expo.dev/versions/v57.0.0/sdk/webview/).

La barra inferior corresponde a tres pestañas reales sin animación lateral. Detalles y pantallas secundarias se abren en una pila y conservan el gesto o botón de regreso.

Los permisos se solicitan al comenzar la exploración y solo en primer plano. El usuario puede mover el mapa sin que la app lo recentre continuamente. Carga, falta de conexión y permisos rechazados ofrecen una recuperación concreta. Respetar el botón/gesto de regreso, VoiceOver/TalkBack y la reducción de animaciones.

## Verificación

Una captura del navegador comprueba solamente la variante auxiliar. La aceptación del mapa nativo, permiso inicial, GPS, gestos y sensores exige observar Expo Go en un teléfono o un emulador; registrar por separado lo comprobado y lo pendiente en [aceptación](docs/acceptance.md).
