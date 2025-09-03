type HttpClientOptions = {
  userAgent?: string;
  timeoutMs?: number;
  retries?: number;
};

export function createHttpClient(opts: HttpClientOptions) {
  const userAgent = opts.userAgent ?? `relparse/0.1 (+https://example.invalid) Bun/${Bun.version}`;
  const DEFAULT_TIMEOUT_MS = 15_000;
  const INITIAL_BACKOFF_MS = 200;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = opts.retries ?? 0;

  async function fetchWithRetry(url: string): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      const controller = AbortSignal.timeout(timeoutMs);
      try {
        const res = await fetch(url, {
          signal: controller,
          headers: { "user-agent": userAgent },
        });
        if (res.ok) {
          return res;
        }
        // Retry on 5xx
        const HTTP_SERVER_ERROR = 500;
        if (res.status >= HTTP_SERVER_ERROR && attempt < retries) {
          await Bun.sleep(INITIAL_BACKOFF_MS * (attempt + 1));
          continue;
        }
        return res;
      } catch (err) {
        if (attempt < retries) {
          await Bun.sleep(INITIAL_BACKOFF_MS * (attempt + 1));
          continue;
        }
        throw err;
      }
    }
  }

  return {
    fetch: fetchWithRetry,
  } as const;
}
