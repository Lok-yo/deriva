# Diseño de Deriva

El rediseño sigue la petición del usuario: una app móvil sencilla y negra, centrada en el mapa. El alcance funcional está en [PRODUCT.md](PRODUCT.md).

## Mapa

Ocupa la pantalla inicial. La marca, el control de ubicación y Al azar flotan sobre la cartografía sin añadir listas o filtros. Los lugares usan pins con `?`. Una selección abre una sola ficha con foto y título; tocar un espacio vacío muestra el precio de 1 USD o el acceso gratuito de administrador. Se conserva la atribución cartográfica.

No hay botón especial para SLRC. Los ejemplos permanecen en sus coordenadas y el mapa sigue el GPS real al obtener permiso. Mover el mapa suspende el centrado automático; cambios de datos y selección conservan el documento y la cámara.

## Pantallas

Tres pestañas sin animación lateral: Mapa, Publicar y Perfil. El detalle comienza con Activar GPS y brújula, seguido de título y foto. Las lecturas de sensores son reales, también al explorar ejemplos. Se retiran metadatos, categorías, descripciones y enlaces de navegación externa del detalle.

Publicar aquí presenta título, cámara y GPS, con errores visibles. El modo remoto conserva el punto elegido, permite galería y explica el pago único antes de abrir Stripe. La cuenta admin muestra su excepción sin precio ni checkout. Perfil reúne cuenta, alertas, actividad y publicaciones propias; no muestra Guardados ni Premium.

## Apariencia y accesibilidad

Fondo casi negro, superficies carbón, texto claro y acento verde claro. Tokens compartidos mantienen contraste de texto y botones. La cartografía OSM recibe un tratamiento oscuro sin añadir otro proveedor. Tamaños de texto del sistema, etiquetas accesibles, safe areas y objetivos táctiles amplios siguen activos.

Android Expo Go conserva el mapa en WebView para evitar el problema del motor Google; iOS y compilaciones propias mantienen el mapa nativo. No se genera APK ni se inicia Expo durante la verificación.

## Validación

Las exportaciones y las capturas auxiliares comprueban estructura e interfaz. Mapa, permisos, cámara, brújula y biometría deben probarse en el teléfono; consulta [aceptación](docs/acceptance.md).
