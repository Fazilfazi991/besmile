export const ACCESS_UNAVAILABLE_MESSAGE = "We couldn't verify access right now. Please try again.";
export const AUTHORIZATION_RETRY_DELAY_MS = 150;
export const AUTHORIZATION_TIMEOUT_MS = 5_000;

type Failure = { code?: string; status?: number; message?: string; name?: string; cause?: unknown };
const transportCodes = new Set(['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_SOCKET']);
export function isTransientAuthorizationError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const failure = error as Failure;
  // Explicit API/SQL errors are authoritative, even if their message mentions a timeout.
  if (failure.status && failure.status >= 400 && failure.status < 500 && failure.status !== 408) return false;
  if (failure.name === 'TimeoutError') return true;
  if (failure.code && !transportCodes.has(failure.code)) return false;
  if (failure.code && transportCodes.has(failure.code)) return true;
  if ([408, 502, 503, 504].includes(failure.status || 0)) return true;
  if (failure.cause && isTransientAuthorizationError(failure.cause)) return true;
  return /^(?:TypeError: )?fetch failed$|^(?:TimeoutError: )?The operation was aborted due to timeout$|\bECONNRESET\b|\bETIMEDOUT\b/i.test(failure.message || '');
}

export class AuthorizationUnavailable extends Error {
  constructor() { super(ACCESS_UNAVAILABLE_MESSAGE); this.name = 'AuthorizationUnavailable'; }
}

type Result = { error?: unknown };
type Options = { onRetry?: () => void; delayMs?: number; timeoutMs?: number };
/** Only for authorization reads and QA fixture login. Never wrap application mutations. */
export async function withAuthorizationTransportRetry<T extends Result>(
  operation: (signal: AbortSignal) => PromiseLike<T>, options: Options = {},
): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(Object.assign(new Error('Authorization lookup timed out'), { code: 'ETIMEDOUT' }));
        }, options.timeoutMs ?? AUTHORIZATION_TIMEOUT_MS);
      });
      const result = await Promise.race([Promise.resolve(operation(controller.signal)), timeout]);
      if (!isTransientAuthorizationError(result.error) || attempt === 1) return result;
    } catch (error) {
      if (!isTransientAuthorizationError(error) || attempt === 1) throw error;
    } finally { clearTimeout(timer); }
    options.onRetry?.();
    await new Promise(resolve => setTimeout(resolve, options.delayMs ?? AUTHORIZATION_RETRY_DELAY_MS));
  }
  throw new AuthorizationUnavailable();
}

export function isInvalidSessionError(error: unknown): boolean {
  const value = error as Failure | null;
  return !!value && (value.status === 401 || value.name === 'AuthSessionMissingError' ||
    ['bad_jwt', 'session_not_found', 'refresh_token_not_found', 'refresh_token_already_used', 'user_not_found'].includes(value.code || ''));
}

export async function authorizationRead<T extends Result>(
  operation: (signal: AbortSignal) => PromiseLike<T>, context: string, sessionLookup = false,
): Promise<T> {
  try {
    const result = await withAuthorizationTransportRetry(operation);
    if (result.error && !(sessionLookup && isInvalidSessionError(result.error))) throw result.error;
    return result;
  } catch (error) {
    const code = (error as Failure)?.code;
    console.warn('Authorization check unavailable', { action: context, code: code && /^[A-Z0-9_]{1,40}$/.test(code) ? code : 'LOOKUP_FAILED' });
    throw new AuthorizationUnavailable();
  }
}
