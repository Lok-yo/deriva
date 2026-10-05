import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import { checkoutUrl } from '../domain/checkout';
import { requireSessionFor } from './supabase';

export async function openRemoteCheckout(userId: string, requestId = Crypto.randomUUID(), isCurrent?: () => boolean): Promise<void> {
  const bound = await requireSessionFor(userId, isCurrent);
  const { data, error } = await bound.client.functions.invoke('deriva-remote-checkout', { body: { requestId } });
  if (error) {
    const response = 'context' in error ? error.context : null;
    if (response instanceof Response) {
      const body = await response.json().catch(() => null) as { error?: unknown; code?: unknown } | null;
      if (response.status === 409 && body?.code === 'remote_access_available') {
        await bound.assertCurrent();
        return;
      }
      if (typeof body?.error === 'string') throw new Error(body.error);
    }
    throw error;
  }
  await bound.assertCurrent();
  await Linking.openURL(checkoutUrl(data));
}
