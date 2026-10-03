import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Deriva', slug: 'deriva', version: '1.0.0', scheme: 'deriva',
  orientation: 'default', userInterfaceStyle: 'light', icon: './assets/icon.png',
  ios: { supportsTablet: true, bundleIdentifier: 'com.kiyo.deriva', infoPlist: { ITSAppUsesNonExemptEncryption: false } },
  android: {
    package: 'com.kiyo.deriva',
    ...(process.env.GOOGLE_SERVICES_JSON ? { googleServicesFile: process.env.GOOGLE_SERVICES_JSON } : {}),
    adaptiveIcon: { foregroundImage: './assets/android-icon-foreground.png', backgroundColor: '#183B32' },
    blockedPermissions: ['android.permission.RECORD_AUDIO', 'android.permission.ACCESS_BACKGROUND_LOCATION', 'android.permission.READ_MEDIA_VIDEO'],
  },
  web: { bundler: 'metro', output: 'single', favicon: './assets/favicon.png' },
  plugins: [
    'expo-router', 'expo-secure-store', 'expo-font',
    ['expo-splash-screen', { image: './assets/splash-icon.png', backgroundColor: '#F5F3EC', imageWidth: 160 }],
    ['expo-image-picker', { cameraPermission: 'Deriva usa tu cámara para fotografiar un lugar después de confirmar tu identidad.', photosPermission: 'Deriva usa la foto que elijas de tu galería para publicar un lugar con Premium.', microphonePermission: false }],
    ['expo-local-authentication', { faceIDPermission: 'Deriva usa Face ID para confirmar tu identidad antes de tomar una foto.' }],
    ['expo-location', { locationWhenInUsePermission: 'Deriva usa tu ubicación mientras exploras para encontrar lugares cercanos y publicar donde estás.' }],
    ['expo-sensors', { motionPermission: 'Deriva usa el magnetómetro para orientar la brújula hacia el lugar que elegiste.' }],
    ['expo-notifications', { color: '#183B32', defaultChannel: 'nearby' }],
  ],
  extra: { ...(process.env.EXPO_PUBLIC_EAS_PROJECT_ID ? { eas: { projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID } } : {}) },
});
