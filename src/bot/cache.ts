import type { HardcoverClient } from "../hardcover/client.ts";
import type { Book } from "../hardcover/types.ts";

export interface CachedSearchOptions {
  /** Results fetched per query. */
  limit: number;
  ttlMs: number;
  maxEntries: number;
}

/**
 * Wraps `searchBooks` with a small TTL cache. Inline queries fire on nearly every keystroke,
 * and Hardcover rate limits API keys, so repeated and concurrent queries share one request.
 */
export function createCachedSearch(
  client: HardcoverClient,
  { limit, ttlMs, maxEntries }: CachedSearchOptions,
): (query: string) => Promise<Book[]> {
  const cache = new Map<string, { expires: number; books: Promise<Book[]> }>();

  return (query) => {
    const key = query.trim().replace(/\s+/g, " ").toLowerCase();
    const now = Date.now();
    const hit = cache.get(key);
    if (hit && hit.expires > now) return hit.books;

    const books = client.searchBooks(key, { limit });
    cache.delete(key);
    cache.set(key, { expires: now + ttlMs, books });
    // Don't cache failures.
    books.catch(() => {
      if (cache.get(key)?.books === books) cache.delete(key);
    });
    // Map iteration is insertion-ordered, so the first key is the oldest.
    if (cache.size > maxEntries) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    return books;
  };
}
