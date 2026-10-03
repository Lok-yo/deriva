import { HttpError, readLimitedJson } from './core.ts';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

export function jsonResponse(
  payload: unknown,
  status = 200,
  cors = false,
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...(cors ? corsHeaders : {}),
      ...(status === 503 ? { 'Retry-After': '15' } : {}),
    },
  });
}

export function errorResponse(error: unknown, cors = false): Response {
  return error instanceof HttpError
    ? jsonResponse(
      { error: error.message, code: error.code },
      error.status,
      cors,
    )
    : jsonResponse(
      {
        error: 'No fue posible completar la operación. Intenta de nuevo.',
        code: 'internal_error',
      },
      503,
      cors,
    );
}

export type JsonFetchResult = { status: number; ok: boolean; payload: unknown };

export async function fetchJson(
  url: string,
  init: RequestInit,
  fetcher: typeof fetch = fetch,
  timeoutMs = 10000,
): Promise<JsonFetchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, {
      ...init,
      signal: controller.signal,
      redirect: 'error',
    });
    if (!response.ok) {
      await response.body?.cancel();
      return { ok: false, status: response.status, payload: null };
    }
    return {
      ok: true,
      status: response.status,
      payload: await readLimitedJson(response, 1024 * 1024),
    };
  } finally {
    clearTimeout(timeout);
  }
}
