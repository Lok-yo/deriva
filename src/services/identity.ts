import { createClient } from '@supabase/supabase-js';

type SessionIdentity = { user: { id: string }; access_token: string };

export class SessionChangedError extends Error {
  constructor() {
    super('La sesión cambió durante la operación. Vuelve a intentarlo desde tu cuenta actual.');
    this.name = 'SessionChangedError';
  }
}

export interface ExpectedSession {
  userId: string;
  accessToken: string;
  assertCurrent(): Promise<void>;
}

export async function captureExpectedSession(
  expectedUserId: string,
  readSession: () => Promise<SessionIdentity | null>,
  isCurrent: () => boolean = () => true,
): Promise<ExpectedSession> {
  if (!isCurrent()) throw new SessionChangedError();
  const session = await readSession();
  if (!isCurrent() || !session?.access_token || session.user.id !== expectedUserId) throw new SessionChangedError();
  return {
    userId: expectedUserId,
    accessToken: session.access_token,
    async assertCurrent() {
      if (!isCurrent()) throw new SessionChangedError();
      const current = await readSession();
      if (!isCurrent() || !current?.access_token || current.user.id !== expectedUserId) throw new SessionChangedError();
    },
  };
}

// This client cannot adopt the mutable app auth client's session between a check and a request.
export function createSessionClient(url: string, key: string, accessToken: string, fetcher?: typeof fetch) {
  return createClient(url, key, {
    accessToken: async () => accessToken,
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` }, ...(fetcher ? { fetch: fetcher } : {}) },
  });
}

export function createOperationQueue() {
  let previous: Promise<unknown> = Promise.resolve();
  return <Result>(operation: () => Promise<Result>): Promise<Result> => {
    const next = previous.then(operation);
    previous = next.then(() => undefined, () => undefined);
    return next;
  };
}
