import { Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { Photo } from '../domain/models';

export async function capturePhoto(): Promise<Photo | null> {
  if (Platform.OS === 'web') throw new Error('Toma la foto desde la app en tu teléfono para confirmar tu identidad con huella o Face ID.');
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) throw new Error('Permite el acceso a la cámara en Ajustes para tomar la foto.');
  if (!await LocalAuthentication.hasHardwareAsync()) throw new Error('Este teléfono no ofrece autenticación biométrica.');
  if (!await LocalAuthentication.isEnrolledAsync()) throw new Error('Configura una huella o Face ID en Ajustes antes de tomar la foto.');
  const authentication = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Confirma tu identidad para tomar la foto', cancelLabel: 'Cancelar',
    fallbackLabel: '', disableDeviceFallback: true, biometricsSecurityLevel: 'strong',
  });
  if (!authentication.success) {
    if (['user_cancel', 'app_cancel', 'system_cancel'].includes(authentication.error)) return null;
    throw new Error('No se pudo confirmar tu identidad. Intenta de nuevo con tu huella o Face ID.');
  }
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], cameraType: ImagePicker.CameraType.back, allowsEditing: false, quality: 1, exif: false });
  if (result.canceled || !result.assets?.[0]) return null;
  return { uri: result.assets[0].uri, source: 'camera', capturedAt: new Date().toISOString(), biometricVerified: true };
}

export async function pickGalleryPhoto(): Promise<Photo | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: false, allowsEditing: false, quality: 1, exif: false });
  if (result.canceled || !result.assets?.[0]) return null;
  return { uri: result.assets[0].uri, source: 'gallery', capturedAt: new Date().toISOString(), biometricVerified: false };
}

export async function encodePhoto(uri: string): Promise<ArrayBuffer> {
  const context = ImageManipulator.manipulate(uri);
  // A new JPEG strips EXIF and gives the same format on both platforms.
  context.resize({ width: 1400 });
  const rendered = await context.renderAsync();
  let encoded = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
  if (!encoded.base64) throw new Error('No se pudo preparar la foto. Intenta tomarla de nuevo.');
  if (encoded.base64.length * 0.75 > 2 * 1024 * 1024) encoded = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.4, base64: true });
  if (!encoded.base64 || encoded.base64.length * 0.75 > 2 * 1024 * 1024) throw new Error('La foto supera 2 MB. Elige otra imagen.');
  const { decode } = await import('base64-arraybuffer');
  return decode(encoded.base64);
}
