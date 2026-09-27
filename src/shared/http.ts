import type { MetadataProviderHost, MetadataProviderRequestInit } from '../vendor/plugin-api';

export type ThrottleAwareError = Error & { name: 'ProviderThrottleError' };

/**
 * BookOrbit builds the throttle error itself (`host.fail('throttled', ...)`), and a plugin cannot
 * `instanceof` it because it holds a different copy of every class. The name is the contract.
 */
export function isThrottled(error: unknown): error is ThrottleAwareError {
  return error instanceof Error && error.name === 'ProviderThrottleError';
}

function retryAfterSeconds(header: string | null): number | undefined {
  if (!header) return undefined;
  const numeric = Number(header);
  if (Number.isFinite(numeric) && numeric > 0) return Math.ceil(numeric);
  const at = Date.parse(header);
  if (Number.isNaN(at)) return undefined;
  const remaining = Math.ceil((at - Date.now()) / 1000);
  return remaining > 0 ? remaining : undefined;
}

/**
 * A request that answers with a usable response or with null.
 *
 * A 429 is the one thing that must not be swallowed: it puts the provider in a cooldown, so it is
 * thrown. Everything else (an unreachable host, a refused address, a non-2xx status, a search that was
 * cancelled) is logged and reported as "nothing here", which is what every caller does with it.
 */
export async function getOk(
  host: MetadataProviderHost,
  provider: string,
  op: string,
  url: string,
  init?: MetadataProviderRequestInit,
): Promise<Response | null> {
  try {
    const response = await host.fetch(url, init);
    if (response.status === 429) throw host.fail('throttled', 'HTTP 429', retryAfterSeconds(response.headers.get('retry-after')));
    if (!response.ok) {
      host.logger.warn(`[${provider}] [fail] op=${op} status=${response.status} - non-ok response`);
      return null;
    }
    return response;
  } catch (error) {
    if (isThrottled(error)) throw error;
    const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    host.logger.warn(`[${provider}] [fail] op=${op} - ${reason.slice(0, 160)}`);
    return null;
  }
}

/**
 * Fetches one detail page per id, paced. A throttle part-way through keeps what was already fetched
 * instead of discarding finished work: the cooldown belongs to the requests still to come, and the
 * next call meets the same 429 and records it.
 */
export async function fetchEach<T>(
  ids: readonly string[],
  host: MetadataProviderHost,
  signal: AbortSignal,
  delayMs: number,
  fetchOne: (id: string) => Promise<T | null>,
): Promise<T[]> {
  const results: T[] = [];
  try {
    for (const id of ids) {
      if (signal.aborted) break;
      if (results.length > 0) await host.sleep(delayMs);
      const item = await fetchOne(id);
      if (item) results.push(item);
    }
  } catch (error) {
    if (results.length === 0 || !isThrottled(error)) throw error;
  }
  return results;
}
