import { backoffSeconds, ExpoDisposition, retryDisposition } from './core.ts';

export interface ClaimedPush {
  id: string;
  token_id: string;
  token: string;
  notification_id: string;
  title: string;
  body: string;
  place_id: string;
  attempts: number;
}

export function expoMessage(row: ClaimedPush) {
  return {
    to: row.token,
    title: Array.from(row.title).slice(0, 80).join(''),
    body: Array.from(row.body).slice(0, 280).join(''),
    sound: 'default',
    channelId: 'nearby',
    data: { placeId: row.place_id, notificationId: row.notification_id },
  };
}

export function requestFailure(
  status: number | undefined,
  attempts: number,
): ExpoDisposition {
  const code = status === undefined
    ? 'ExpoNetworkUnavailable'
    : `ExpoHttp${status}`;
  if (status !== undefined && status >= 400 && status < 500 && status !== 429) {
    return { action: 'failed', error: code };
  }
  return retryDisposition(attempts, code);
}

export function retryAvailableAt(attempts: number, now = Date.now()): string {
  return new Date(now + backoffSeconds(attempts) * 1000).toISOString();
}

export function receiptExpired(sentAt: string, now = Date.now()): boolean {
  const sent = Date.parse(sentAt);
  return !Number.isFinite(sent) || now - sent >= 24 * 60 * 60 * 1000;
}

export function isExpoPushToken(token: string): boolean {
  return /^(?:ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{1,256}\]$/.test(
    token,
  );
}
