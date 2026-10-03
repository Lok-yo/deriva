import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Crypto from 'expo-crypto';
import { requireSessionFor } from './supabase';
import { createOperationQueue } from './identity';
import { commitPushRegistration, createNotificationTapConsumer } from './notificationsCore';

const deviceKey = 'deriva.installation';
const tokenKey = (userId: string) => `deriva.pushToken.${userId}`;
const pushOperations = createOperationQueue();
const projectId = () => Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

export function canRegisterPush(): boolean {
  return Platform.OS !== 'web' && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient && Device.isDevice && !!projectId();
}

export function registerPushToken(expectedUserId: string, options: { requestPermission?: boolean; isCurrent?: () => boolean } = {}): Promise<boolean> {
  return pushOperations(async () => {
    const requestPermission = options.requestPermission ?? true;
    if (!canRegisterPush()) {
      if (!requestPermission) return false;
      if (Platform.OS === 'web') throw new Error('Activa las notificaciones desde Deriva en tu teléfono.');
      if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) throw new Error('Las notificaciones push necesitan la versión instalada de Deriva.');
      if (!Device.isDevice) throw new Error('Activa las notificaciones en un teléfono físico para probar la entrega.');
      throw new Error('Las notificaciones todavía no están disponibles en esta versión.');
    }
    const session = await requireSessionFor(expectedUserId, options.isCurrent);
    const Notifications = await import('expo-notifications');
    await session.assertCurrent();
    Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }) });
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('nearby', { name: 'Lugares cerca de ti', importance: Notifications.AndroidImportance.HIGH, lightColor: '#DFFB72' });
      await session.assertCurrent();
    }
    let permission = await Notifications.getPermissionsAsync();
    await session.assertCurrent();
    if (permission.status !== 'granted' && requestPermission) {
      permission = await Notifications.requestPermissionsAsync();
      await session.assertCurrent();
    }
    if (permission.status !== 'granted') {
      if (!requestPermission) return false;
      throw new Error('Permite las notificaciones en Ajustes para recibir nuevos lugares.');
    }
    const token = (await Notifications.getExpoPushTokenAsync({ projectId: projectId() })).data;
    await session.assertCurrent();
    let deviceId = await AsyncStorage.getItem(deviceKey);
    await session.assertCurrent();
    if (!deviceId) {
      deviceId = Crypto.randomUUID();
      await AsyncStorage.setItem(deviceKey, deviceId);
      await session.assertCurrent();
    }
    await commitPushRegistration(session, {
      async register() {
        const result = await session.client.rpc('deriva_register_push_token', { p_token: token, p_platform: Platform.OS, p_device_id: deviceId });
        if (result.error) throw result.error;
      },
      async persist() { await AsyncStorage.setItem(tokenKey(expectedUserId), token); },
      async rollback() {
        const result = await session.client.from('deriva_push_tokens').delete().eq('user_id', expectedUserId).eq('token', token);
        if (result.error) throw result.error;
        if (await AsyncStorage.getItem(tokenKey(expectedUserId)) === token) await AsyncStorage.removeItem(tokenKey(expectedUserId));
      },
    });
    return true;
  });
}

export function unregisterPushToken(expectedUserId: string): Promise<void> {
  return pushOperations(async () => {
    const session = await requireSessionFor(expectedUserId);
    const token = await AsyncStorage.getItem(tokenKey(expectedUserId));
    await session.assertCurrent();
    if (!token) return;
    const result = await session.client.from('deriva_push_tokens').delete().eq('user_id', expectedUserId).eq('token', token);
    if (result.error) throw result.error;
    if (await AsyncStorage.getItem(tokenKey(expectedUserId)) === token) await AsyncStorage.removeItem(tokenKey(expectedUserId));
    await session.assertCurrent();
  });
}

export function listenForNotificationTaps(onPlace: (placeId: string) => void): () => void {
  if (Platform.OS === 'web' || Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return () => {};
  let disposed = false;
  let subscription: { remove(): void } | null = null;
  void import('expo-notifications').then(async Notifications => {
    if (disposed) return;
    Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }) });
    const consume = createNotificationTapConsumer(onPlace, () => Notifications.clearLastNotificationResponseAsync(), () => disposed);
    subscription = Notifications.addNotificationResponseReceivedListener(consume);
    consume(await Notifications.getLastNotificationResponseAsync());
  }).catch(() => {});
  return () => { disposed = true; subscription?.remove(); };
}
