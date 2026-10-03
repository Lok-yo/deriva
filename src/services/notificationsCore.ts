import type { ExpectedSession } from './identity';

export async function commitPushRegistration(session: ExpectedSession, operations: {
  register(): Promise<void>;
  persist(): Promise<void>;
  rollback(): Promise<void>;
}): Promise<void> {
  await session.assertCurrent();
  try {
    await operations.register();
    await session.assertCurrent();
    await operations.persist();
    await session.assertCurrent();
  } catch (error) {
    // The server may have committed even if the response was lost; delete using the captured owner.
    await operations.rollback().catch(() => {});
    throw error;
  }
}

interface TapResponse {
  actionIdentifier?: string;
  notification: { request: { identifier: string; content: { data?: Record<string, unknown> } } };
}

export function createNotificationTapConsumer(
  onPlace: (placeId: string) => void,
  clearLast: () => Promise<void>,
  isDisposed: () => boolean = () => false,
) {
  const consumed = new Set<string>();
  return (response: TapResponse | null) => {
    const placeId = response?.notification.request.content.data?.placeId;
    if (isDisposed() || !response || typeof placeId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(placeId)) return;
    const key = JSON.stringify([response.notification.request.identifier, response.actionIdentifier ?? 'default']);
    if (consumed.has(key)) return;
    consumed.add(key);
    if (consumed.size > 128) consumed.delete(consumed.values().next().value!);
    onPlace(placeId);
    void clearLast().catch(() => {});
  };
}
