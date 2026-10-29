export interface CachedSearchOptions {
  ttlMs: number;
  maxEntries: number;
}

/**
 * Wraps a search function with a small TTL cache. Inline queries fire on nearly every keystroke,
 * and Hardcover rate limits API keys, so repeated and concurrent queries share one request.
 */
export function createCachedSearch<T>(
  search: (query: string) => Promise<T>,
  { ttlMs, maxEntries }: CachedSearchOptions,
): (query: string) => Promise<T> {
  const cache = new Map<string, { expires: number; result: Promise<T> }>();

  return (query) => {
    const key = query.trim().replace(/\s+/g, " ").toLowerCase();
    const now = Date.now();
    const hit = cache.get(key);
    if (hit && hit.expires > now) return hit.result;

    const result = search(key);
    cache.delete(key);
    cache.set(key, { expires: now + ttlMs, result });
    // Don't cache failures.
    result.catch(() => {
      if (cache.get(key)?.result === result) cache.delete(key);
    });
    // Map iteration is insertion-ordered, so the first key is the oldest.
    if (cache.size > maxEntries) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    return result;
  };
}
