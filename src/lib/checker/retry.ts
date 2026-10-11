/** Errors worth retrying: overloaded, rate limited or a 5xx from the API. */
export function isRetryable(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /overloaded|rate.?limit|429|\b5\d\d\b|internal server error|service unavailable|bad gateway|gateway timeout|ECONNRESET|ETIMEDOUT/i.test(
    text,
  );
}

/** Auth-shaped failures: no login or a bad key. These fall back to replay. */
export function isAuthError(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return /not logged in|please run \/login|invalid api key|authentication|unauthori[sz]ed|\b401\b|oauth token/i.test(text);
}

export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (attempt: number, delayMs: number, error: unknown) => void;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Runs `fn`, retrying retryable errors with exponential backoff and jitter. */
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const attempts = options.attempts ?? 4;
  const base = options.baseDelayMs ?? 2000;
  const max = options.maxDelayMs ?? 30000;
  const sleep = options.sleep ?? defaultSleep;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (attempt === attempts || !isRetryable(error)) throw error;
      const delay = Math.min(max, base * 2 ** (attempt - 1)) * (0.75 + Math.random() * 0.5);
      options.onRetry?.(attempt, Math.round(delay), error);
      await sleep(delay);
    }
  }
  throw lastError;
}
