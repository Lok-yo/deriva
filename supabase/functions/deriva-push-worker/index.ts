import { createServiceClient, ServiceClient } from '../_shared/backend.ts';
import {
  classifyExpoResult,
  ExpoDisposition,
  HttpError,
  isRecord,
  mapConcurrent,
  retryDisposition,
} from '../_shared/core.ts';
import { errorResponse, fetchJson, jsonResponse } from '../_shared/http.ts';
import {
  ClaimedPush,
  expoMessage,
  isExpoPushToken,
  receiptExpired,
  requestFailure,
  retryAvailableAt,
} from '../_shared/push.ts';

interface ReceiptRow {
  id: string;
  token_id: string;
  attempts: number;
  expo_ticket_id: string;
  available_at: string;
}

interface Counts {
  claimed: number;
  ticketed: number;
  delivered: number;
  retried: number;
  failed: number;
  removedTokens: number;
  pendingReceipts: number;
  errors: number;
}

type QueueState = 'processing' | 'ticketed';

async function updateQueue(
  client: ServiceClient,
  row: Pick<ClaimedPush, 'id' | 'attempts'>,
  previousState: QueueState,
  patch: Record<string, unknown>,
) {
  const { data, error } = await client.from('deriva_push_queue').update({
    ...patch,
    updated_at: new Date().toISOString(),
  }).eq('id', row.id).eq('state', previousState).eq('attempts', row.attempts)
    .select('id');
  if (error) {
    throw new HttpError(
      503,
      'push_queue_unavailable',
      'No se pudo actualizar la cola de notificaciones.',
    );
  }
  return Array.isArray(data) && data.length > 0;
}

async function removeToken(
  client: ServiceClient,
  row: Pick<ClaimedPush, 'token_id'> & { token?: string },
) {
  let query = client.from('deriva_push_tokens').delete().eq('id', row.token_id);
  if (row.token !== undefined) query = query.eq('token', row.token);
  const { data, error } = await query.select('id');
  if (error) {
    throw new HttpError(
      503,
      'push_tokens_unavailable',
      'No se pudo retirar el dispositivo de notificaciones.',
    );
  }
  return Array.isArray(data) && data.length > 0;
}

async function settle(
  client: ServiceClient,
  row: ClaimedPush | ReceiptRow,
  previousState: QueueState,
  disposition: ExpoDisposition,
  counts: Counts,
) {
  try {
    if (disposition.action === 'removeToken') {
      if (await removeToken(client, row)) {
        counts.removedTokens += 1;
      } else if (
        await updateQueue(client, row, previousState, {
          state: 'failed',
          lease_until: null,
          expo_ticket_id: null,
          last_error: disposition.error,
        })
      ) counts.failed += 1;
      return;
    }
    if (disposition.action === 'ticketed') {
      const sentAt = new Date().toISOString();
      if (
        await updateQueue(client, row, previousState, {
          state: 'ticketed',
          lease_until: null,
          expo_ticket_id: disposition.ticketId,
          // Keep the initial ticket time here; updated_at becomes the latest receipt poll.
          available_at: sentAt,
          last_error: null,
        })
      ) counts.ticketed += 1;
      return;
    }
    if (disposition.action === 'delivered') {
      if (
        await updateQueue(client, row, previousState, {
          state: 'delivered',
          lease_until: null,
          last_error: null,
        })
      ) counts.delivered += 1;
      return;
    }
    const retry = disposition.action === 'retry';
    if (
      await updateQueue(client, row, previousState, {
        state: retry ? 'pending' : 'failed',
        lease_until: null,
        expo_ticket_id: null,
        last_error: disposition.error,
        ...(retry ? { available_at: retryAvailableAt(row.attempts) } : {}),
      })
    ) {
      if (retry) counts.retried += 1;
      else counts.failed += 1;
    }
  } catch {
    // The claim RPC recovers an expired processing lease if a database write fails.
    counts.errors += 1;
  }
}

function expoHeaders(accessToken: string | undefined): Record<string, string> {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
}

async function retainReceipt(
  client: ServiceClient,
  row: ReceiptRow,
  counts: Counts,
  error = 'ReceiptPending',
) {
  if (receiptExpired(row.available_at)) {
    await settle(client, row, 'ticketed', {
      action: 'failed',
      error: 'ReceiptExpired',
    }, counts);
    return;
  }
  try {
    if (await updateQueue(client, row, 'ticketed', { last_error: error })) {
      counts.pendingReceipts += 1;
    }
  } catch {
    counts.errors += 1;
  }
}

async function processReceipts(
  client: ServiceClient,
  accessToken: string | undefined,
  counts: Counts,
) {
  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data, error } = await client.from('deriva_push_queue')
    .select('id,token_id,attempts,expo_ticket_id,available_at')
    .eq('state', 'ticketed').not('expo_ticket_id', 'is', null)
    .lte('updated_at', cutoff).order('updated_at', { ascending: true }).limit(
      100,
    );
  if (error) {
    throw new HttpError(
      503,
      'push_receipts_unavailable',
      'No se pudo consultar la cola de recibos.',
    );
  }
  const rows = (data ?? []) as ReceiptRow[];
  if (!rows.length) return;
  let payload: unknown;
  let failure = 'ExpoNetworkUnavailable';
  try {
    const result = await fetchJson(
      'https://exp.host/--/api/v2/push/getReceipts',
      {
        method: 'POST',
        headers: expoHeaders(accessToken),
        body: JSON.stringify({ ids: rows.map((row) => row.expo_ticket_id) }),
      },
    );
    if (result.ok) {
      payload = result.payload;
      failure = 'InvalidExpoResponse';
    } else failure = `ExpoHttp${result.status}`;
  } catch {
    // Existing tickets may already have reached APNs/FCM. Keep polling them.
  }
  const receipts = isRecord(payload) && isRecord(payload.data)
    ? payload.data
    : undefined;
  await mapConcurrent(rows, 10, async (row) => {
    if (!receipts) {
      await retainReceipt(client, row, counts, failure);
    } else if (!Object.hasOwn(receipts, row.expo_ticket_id)) {
      await retainReceipt(client, row, counts);
    } else {
      await settle(
        client,
        row,
        'ticketed',
        classifyExpoResult(receipts[row.expo_ticket_id], row.attempts, true),
        counts,
      );
    }
  });
}

async function sendClaimed(
  client: ServiceClient,
  accessToken: string | undefined,
  counts: Counts,
) {
  const { data, error } = await client.rpc('deriva_claim_push', {
    p_limit: 100,
  });
  if (error || !Array.isArray(data)) {
    throw new HttpError(
      503,
      'push_claim_unavailable',
      'No se pudieron reservar las notificaciones pendientes.',
    );
  }
  const rows = data as ClaimedPush[];
  counts.claimed = rows.length;
  if (!rows.length) return;
  const valid: ClaimedPush[] = [];
  for (const row of rows) {
    if (isExpoPushToken(row.token)) valid.push(row);
    else {await settle(client, row, 'processing', {
        action: 'failed',
        error: 'InvalidPushToken',
      }, counts);}
  }
  // The SQL claim clamps to 100. Slicing also protects the provider's batch limit.
  for (let offset = 0; offset < valid.length; offset += 100) {
    const batch = valid.slice(offset, offset + 100);
    let payload: unknown;
    let status: number | undefined;
    try {
      const result = await fetchJson('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: expoHeaders(accessToken),
        body: JSON.stringify(batch.map(expoMessage)),
      });
      status = result.status;
      if (result.ok) payload = result.payload;
    } catch {
      // A timeout, network failure, or invalid JSON settles every claimed row below.
    }
    const tickets = isRecord(payload) && Array.isArray(payload.data)
      ? payload.data
      : undefined;
    await mapConcurrent(
      batch.map((row, index) => ({ row, index })),
      10,
      ({ row, index }) =>
        settle(
          client,
          row,
          'processing',
          tickets
            ? classifyExpoResult(tickets[index], row.attempts)
            : status !== undefined && status >= 200 && status < 300
            ? retryDisposition(row.attempts, 'InvalidExpoResponse')
            : requestFailure(status, row.attempts),
          counts,
        ),
    );
  }
}

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') {
    return jsonResponse(
      { error: 'Utiliza POST.', code: 'method_not_allowed' },
      405,
    );
  }
  try {
    const secret = request.headers.get('x-deriva-job-token');
    if (!secret || secret.length > 8192) {
      throw new HttpError(
        401,
        'worker_authentication_required',
        'El trabajo no está autorizado.',
      );
    }
    const client = createServiceClient();
    const { data: authorized, error } = await client.rpc(
      'deriva_authorize_worker',
      { p_secret: secret },
    );
    if (error) {
      throw new HttpError(
        503,
        'worker_authentication_unavailable',
        'No fue posible validar el trabajo.',
      );
    }
    if (authorized !== true) {
      throw new HttpError(
        401,
        'invalid_worker_authentication',
        'El trabajo no está autorizado.',
      );
    }
    const counts: Counts = {
      claimed: 0,
      ticketed: 0,
      delivered: 0,
      retried: 0,
      failed: 0,
      removedTokens: 0,
      pendingReceipts: 0,
      errors: 0,
    };
    const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
    // Authentication precedes every queue read/claim; receipts can remove revoked tokens.
    await processReceipts(client, accessToken, counts);
    await sendClaimed(client, accessToken, counts);
    return jsonResponse(counts, counts.errors > 0 ? 503 : 200);
  } catch (error) {
    return errorResponse(error);
  }
});
