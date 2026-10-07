# Deriva

Aplicación móvil para publicar y encontrar lugares en un mapa. Está hecha con React Native y Expo (SDK 57) para Android e iOS. La interfaz está en español, con fondo negro, pines `?` y tres pestañas: **Explorar**, **Publicar** y **Perfil**.

## Empezar

```bash
npm ci
cp .env.example .env
```

Completa en `.env` la URL y la clave publishable de Supabase. Ese archivo no se versiona. La app no recibe claves privadas de Stripe ni la clave de servicio de Supabase.

## Expo Go

Sirve para revisar la interfaz sin instalar un APK. Usa un Expo Go compatible con SDK 57, en la misma red que el equipo.

```bash
npm start
```

Si la red bloquea la conexión local, usa `npm run start:tunnel`.

En Android, Expo Go muestra el mapa con Leaflet y OpenStreetMap dentro de un WebView. Así se evita un [mapa negro conocido del SDK 57](https://github.com/expo/expo/issues/49323).

## APK para el celular

El perfil `preview` de `eas.json` genera un APK instalable. No es un paquete para Play Store. En Android usa el mapa nativo.

```bash
npx eas-cli@latest login
npx eas-cli@latest build --platform android --profile preview
```

Ese perfil lee el entorno `preview` de EAS. Ahí deben estar las mismas variables públicas que en `.env`:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `EXPO_PUBLIC_EAS_PROJECT_ID`

Cuando la compilación termina, abre su enlace en el teléfono e instala el APK. Android pide permiso para instalar desde el navegador.

El push remoto necesita credenciales FCM (`GOOGLE_SERVICES_JSON`). El perfil `preview` no las incluye, y Expo Go tampoco registra tokens push.

## Uso

El mapa pide la ubicación en primer plano y se centra en el GPS. Si el permiso falla, se puede explorar el mapa sin simular esa posición.

| Flujo | Fotografía | Ubicación | Precio |
| --- | --- | --- | --- |
| Publicar aquí | Cámara, después de biometría | GPS actual | Gratis |
| Tocar un punto vacío | Cámara o galería | El punto elegido | 1 USD por publicación |
| Cuenta con rol de administrador | Cámara o galería | El punto elegido | Gratis |

Una publicación necesita un título de 3 a 80 caracteres y una fotografía. El rol de administrador se asigna en el servidor. La app no permite concedérselo desde el perfil.

El pago remoto está en modo de prueba. Checkout se abre en el navegador y solo el webhook firmado habilita una publicación. Volver desde Stripe no basta. No hay suscripción ni categorías.

La ficha de un lugar muestra la foto, el título y, arriba, **Activar GPS y brújula**. No se guardan datos biométricos. Hay seis lugares de ejemplo en San Luis Río Colorado: viven en la app, no en la base de datos, y no sustituyen el GPS.

En **Explorar**, el mapa ordena una lista horizontal por cercanía cuando hay GPS. **A la deriva** prefiere un lugar que aún no hayas abierto y, con GPS, uno a menos de 10 km si hay alguno. Abrir la ficha cuenta como descubrimiento; el progreso se guarda solo en ese teléfono y la ficha propone el siguiente lugar cercano sin descubrir.

Las cuentas pueden activar avisos de lugares cercanos. El radio por defecto es 10 km y se puede ajustar a 1, 5, 10, 25 o 50 km. El centro queda fijo al guardar la zona.

## Comprobar el código

```bash
npm run check
```

Eso ejecuta el typecheck, el linter y las pruebas. No sustituye probar el mapa, la cámara, el GPS ni la biometría en un teléfono.

## Estructura

- `src/app`: pantallas de Expo Router.
- `src/ui` y `src/maps`: interfaz y variantes del mapa.
- `src/domain`: publicación, pagos y geografía.
- `src/services` y `src/state`: sensores, cuenta, datos y sincronización.
- `supabase`: migraciones, funciones y pruebas del servidor.
