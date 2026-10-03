# Deriva

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

Aplicación nativa para teléfonos Android e iOS con React Native y Expo. La prueba actual debe abrirse en **Expo Go**, sin generar un APK. La versión web es una herramienta auxiliar de desarrollo.

El usuario inicia el servidor de Expo; el agente no lo inicia ni lo deja activo durante verificaciones.

## Product Purpose

Descubrir lugares y compartir puntos con fotografía y título. El mapa es la pantalla de entrada y el centro de la exploración: al abrir la app se solicita ubicación y, con permiso, se centra en el GPS del teléfono.

## Operating Context

Interfaz en español. El usuario pidió simplificar la app y añadir ejemplos en San Luis Río Colorado, Sonora (SLRC). Debe poder explorar sin iniciar sesión; publicar requiere una cuenta.

## Capabilities and Constraints

- Gratis: publicar en la ubicación actual, con fotografía tomada por la cámara después de autenticación biométrica.
- Premium: elegir cualquier punto y utilizar fotografías de la galería. Los derechos los verifica el servidor; su compra real se habilitará posteriormente mediante RevenueCat y las tiendas.
- Cuatro capacidades del teléfono: cámara, GPS, magnetómetro y biometría. No se almacena información biométrica.
- Supabase proporciona cuenta, base de datos, fotografías privadas y sincronización en tiempo real. La integración de push está preparada para una compilación propia.
- Expo Go permite explorar y probar cuenta, datos y sensores admitidos. Las compras y push remoto permanecen desactivados. Face ID en iOS requiere una compilación propia.
- Los ejemplos de SLRC son contenido local identificado como ejemplo. No crean usuarios ni publicaciones en Supabase, y sus coordenadas nunca sustituyen una lectura de GPS.

## Brand Commitments

Nombre confirmado: **Deriva**. El usuario pidió una experiencia sencilla centrada en el mapa; no eligió una paleta ni una tipografía específica.

## Evidence on Hand

El backend conectado y las reglas de acceso cuentan con verificaciones previas documentadas en [aceptación](docs/acceptance.md). Esas pruebas no demuestran el comportamiento del mapa nativo ni de sensores físicos. Los ejemplos usan lugares públicos de SLRC con fuentes en el [README](README.md#ejemplos-de-slrc); sus marcadores son referencias aproximadas, no accesos verificados.

## Product Principles

1. Abrir directamente la exploración en el mapa.
2. Pedir permisos con un propósito claro y permitir seguir explorando cuando se rechazan.
3. Mostrar detalles y funciones secundarias cuando el usuario los solicita.
4. Distinguir ejemplos, datos reales y ubicación del teléfono.
5. Mantener las reglas de Gratis/Premium y la biometría al simplificar la interfaz.
