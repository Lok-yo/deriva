import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import type { PurchasesPackage } from 'react-native-purchases';
import type { PurchaseOption } from '../domain/models';
import { requireSessionFor } from './supabase';
import { createOperationQueue, SessionChangedError } from './identity';

let configuredUser: string | null = null;
let packages: PurchasesPackage[] = [];
let packageUser: string | null = null;
const billingOperations = createOperationQueue();
type BillingSession = Awaited<ReturnType<typeof requireSessionFor>>;
type PurchasesSdk = typeof import('react-native-purchases').default;

async function assertSdkIdentity(sdk: PurchasesSdk, session: BillingSession) {
  const sdkUserId = await sdk.getAppUserID();
  await session.assertCurrent();
  if (sdkUserId !== session.userId) throw new SessionChangedError();
}

async function purchasesSdk(session: BillingSession) {
  if (Platform.OS === 'web') throw new Error('Las compras están disponibles en la app Android o iOS.');
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) throw new Error('Para comprar o restaurar, abre la versión instalada de Deriva. Expo Go permite ver la interfaz.');
  const apiKey = Platform.OS === 'ios' ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
  if (!apiKey) throw new Error('Las compras todavía no están disponibles. Puedes seguir usando el plan gratuito.');
  const { default: Purchases } = await import('react-native-purchases');
  await session.assertCurrent();
  const configured = await Purchases.isConfigured();
  await session.assertCurrent();
  if (!configured) {
    Purchases.configure({ apiKey, appUserID: session.userId });
    configuredUser = session.userId;
  } else {
    const sdkUserId = await Purchases.getAppUserID();
    await session.assertCurrent();
    if (sdkUserId !== session.userId) await Purchases.logIn(session.userId);
    configuredUser = session.userId;
  }
  if (packageUser !== session.userId) { packages = []; packageUser = null; }
  await assertSdkIdentity(Purchases, session);
  return Purchases;
}

async function loadPurchaseOptions(sdk: PurchasesSdk, session: BillingSession): Promise<PurchaseOption[]> {
  const offerings = await sdk.getOfferings();
  await assertSdkIdentity(sdk, session);
  packages = offerings.current?.availablePackages ?? [];
  packageUser = session.userId;
  if (!packages.length) throw new Error('No hay planes disponibles en la tienda en este momento. Intenta más tarde.');
  return packages.map(item => ({ identifier: item.identifier, title: item.product.title || 'Deriva Premium', price: item.product.priceString, period: item.product.subscriptionPeriod ?? 'Compra única' }));
}

export function getPurchaseOptions(userId: string): Promise<PurchaseOption[]> {
  return billingOperations(async () => {
    const session = await requireSessionFor(userId);
    return loadPurchaseOptions(await purchasesSdk(session), session);
  });
}

async function syncAccess(session: BillingSession): Promise<boolean> {
  await session.assertCurrent();
  const { data, error } = await session.client.functions.invoke('deriva-billing-sync', { body: {} });
  await session.assertCurrent();
  if (error) throw new Error('Tu compra aún no pudo verificarse. Usa Restaurar compras para intentarlo otra vez; no necesitas volver a pagar.');
  return data?.premium === true;
}

export function syncPurchaseAccess(userId: string): Promise<boolean> {
  return billingOperations(async () => syncAccess(await requireSessionFor(userId)));
}

export function purchaseOption(userId: string, identifier: string): Promise<boolean> {
  return billingOperations(async () => {
    const session = await requireSessionFor(userId);
    const sdk = await purchasesSdk(session);
    if (packageUser !== userId || !packages.length) await loadPurchaseOptions(sdk, session);
    const option = packages.find(item => item.identifier === identifier);
    if (!option) throw new Error('Este plan ya no está disponible. Actualiza los planes de la tienda.');
    await assertSdkIdentity(sdk, session);
    try { await sdk.purchasePackage(option); }
    catch (error) {
      if (typeof error === 'object' && error && 'userCancelled' in error && error.userCancelled) throw new Error('Cancelaste la compra. Puedes volver cuando quieras.');
      throw error;
    }
    await assertSdkIdentity(sdk, session);
    // A long store sheet can outlive its original JWT; recapture only this same account.
    const current = await requireSessionFor(userId);
    const premium = await syncAccess(current);
    await assertSdkIdentity(sdk, current);
    return premium;
  });
}

export function restorePurchaseAccess(userId: string): Promise<boolean> {
  return billingOperations(async () => {
    const session = await requireSessionFor(userId);
    const sdk = await purchasesSdk(session);
    await assertSdkIdentity(sdk, session);
    await sdk.restorePurchases();
    await assertSdkIdentity(sdk, session);
    const current = await requireSessionFor(userId);
    const premium = await syncAccess(current);
    await assertSdkIdentity(sdk, current);
    return premium;
  });
}

export function clearBillingIdentity(expectedUserId: string): Promise<void> {
  return billingOperations(async () => {
    // A delayed logout of A must never log out B's already configured SDK.
    if (configuredUser !== expectedUserId) return;
    if (packageUser === expectedUserId) { packages = []; packageUser = null; }
    if (Platform.OS === 'web' || Constants.executionEnvironment === ExecutionEnvironment.StoreClient) { configuredUser = null; return; }
    const { default: Purchases } = await import('react-native-purchases');
    if (await Purchases.isConfigured() && await Purchases.getAppUserID() === expectedUserId && !await Purchases.isAnonymous()) await Purchases.logOut();
    configuredUser = null;
  });
}
