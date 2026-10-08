import type { ConfigContext, ExpoConfig } from 'expo/config';

const androidMapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Deriva', slug: 'deriva', version: '1.0.0', scheme: 'deriva',
  orientation: 'default', userInterfaceStyle: 'dark', icon: './assets/icon.png',
  ios: { supportsTablet: true, bundleIdentifier: 'com.kiyo.deriva', infoPlist: { ITSAppUsesNonExemptEncryption: false } },
  android: {
    package: 'com.kiyo.deriva',
    ...(process.env.GOOGLE_SERVICES_JSON ? { googleServicesFile: process.env.GOOGLE_SERVICES_JSON } : {}),
    adaptiveIcon: { foregroundImage: './assets/android-icon-foreground.png', backgroundColor: '#090B0C' },
    blockedPermissions: ['android.permission.RECORD_AUDIO', 'android.permission.ACCESS_BACKGROUND_LOCATION', 'android.permission.READ_MEDIA_VIDEO'],
  },
  web: { bundler: 'metro', output: 'single', favicon: './assets/favicon.png' },
  plugins: [
    'expo-router', 'expo-secure-store', 'expo-font',
    ['expo-splash-screen', { image: './assets/splash-icon.png', backgroundColor: '#090B0C', imageWidth: 160 }],
    ['expo-image-picker', { cameraPermission: 'Deriva usa tu cámara para fotografiar un lugar después de confirmar tu identidad.', photosPermission: 'Deriva usa la foto que elijas de tu galería para publicar en el punto que elijas.', microphonePermission: false }],
    ['expo-local-authentication', { faceIDPermission: 'Deriva usa Face ID para confirmar tu identidad antes de tomar una foto.' }],
    ['expo-location', { locationWhenInUsePermission: 'Deriva usa tu ubicación mientras exploras para encontrar lugares cercanos y publicar donde estás.' }],
    ['expo-sensors', { motionPermission: 'Deriva usa el magnetómetro para orientar la brújula hacia el lugar que elegiste.' }],
    ['expo-notifications', { color: '#C5ED95', defaultChannel: 'nearby' }],
    ...(androidMapsKey ? [['react-native-maps', { androidGoogleMapsApiKey: androidMapsKey }] as [string, object]] : []),
  ],
  extra: {
    ...config.extra,
    androidNativeMap: !!androidMapsKey,
    eas: {
      ...config.extra?.eas,
      ...(process.env.EXPO_PUBLIC_EAS_PROJECT_ID ? { projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID } : {}),
    },
  },
});
