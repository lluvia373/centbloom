import type { Session, SupabaseClient } from "@supabase/supabase-js";

type Result = { error: { code: string; message: string } | null };
type Query<T> = PromiseLike<T> & {
  setHeader(name: string, value: string): Query<T>;
};
const refreshes = new WeakMap<SupabaseClient, Promise<Session>>();
const SIGN_IN_REQUIRED = "로그인이 만료되었습니다. 다시 로그인해 주세요.";

function requireAccount(session: Session | null, userId: string): Session {
  if (!session) throw new Error(SIGN_IN_REQUIRED);
  if (session.user.id !== userId)
    throw new Error("계정이 변경되어 요청을 중단했습니다.");
  return session;
}

// One deadline includes auth, the request and recovery; callers can also cancel.
function withinDeadline<T>(task: PromiseLike<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
    Promise.resolve(task).then(resolve, reject).finally(() =>
      signal.removeEventListener("abort", abort),
    );
  });
}

async function currentSession(client: SupabaseClient, userId: string) {
  const { data, error } = await client.auth.getSession();
  if (error) throw new Error("로그인 연결을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  return requireAccount(data.session, userId);
}

async function recoverSession(client: SupabaseClient, userId: string, token: string) {
  let pending = refreshes.get(client);
  if (!pending) {
    pending = (async () => {
      const current = await currentSession(client, userId);
      // A concurrent request or another tab may already have refreshed it.
      if (current.access_token !== token) return current;
      const { data, error } = await client.auth.refreshSession();
      if (error) throw new Error("로그인 연결을 복구하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      return requireAccount(data.session, userId);
    })();
    refreshes.set(client, pending);
    const clear = () => { if (refreshes.get(client) === pending) refreshes.delete(client); };
    void pending.then(clear, clear);
  }
  return requireAccount(await pending, userId);
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

/** Only replay explicit JWT rejections (before SQL execution), never ambiguous writes.
 * Factories must preserve mutation payloads, revisions and idempotency IDs.
 * Call outside onAuthStateChange: auth callbacks run while the auth lock is held.
 */
export async function runSupabaseRequest<T extends Result>(
  client: SupabaseClient,
  userId: string,
  request: (signal: AbortSignal) => Query<T>,
  signal = AbortSignal.timeout(20_000),
): Promise<T> {
  let refreshed = false;
  let clockRetries = 0;
  for (;;) {
    signal.throwIfAborted();
    const session = await withinDeadline(currentSession(client, userId), signal);
    signal.throwIfAborted();
    const result = await withinDeadline(
      request(signal).setHeader("Authorization", "Bearer " + session.access_token),
      signal,
    );
    // Pin the request to its owning account, even if the SDK sees a newer login.
    await withinDeadline(currentSession(client, userId), signal);
    const error = result.error;
    if (!error || !["PGRST301", "PGRST303"].includes(error.code)) return result;
    const future = /issued at future|not yet valid|not valid yet/i.test(error.message);
    if (future && clockRetries < 3) {
      // Minting another token cannot fix server clock skew. Let this token settle.
      await pause(1000 * 2 ** clockRetries++, signal);
      continue;
    }
    if (!future && !refreshed) {
      refreshed = true;
      await withinDeadline(recoverSession(client, userId, session.access_token), signal);
      continue;
    }
    console.warn("Supabase session recovery exhausted", { code: error.code, clockSkew: future });
    throw new Error(future
      ? "로그인 서버의 시간 확인이 지연되고 있습니다. 잠시 후 다시 시도해 주세요."
      : "로그인 연결을 복구하지 못했습니다. 다시 로그인해 주세요.");
  }
}
