import { print } from "graphql";
import type { TadaDocumentNode } from "gql.tada";
import { graphql, type ResultOf, type VariablesOf } from "./graphql.ts";
import { parseSearchResults } from "./parse.ts";
import type { Book } from "./types.ts";

export const HARDCOVER_API_URL = "https://api.hardcover.app/v1/graphql";

const SearchBooksQuery = graphql(`
  query SearchBooks($query: String!, $perPage: Int!) {
    search(query: $query, query_type: "Book", per_page: $perPage, page: 1) {
      error
      results
    }
  }
`);

/** Hardcover API keys are shown with a "Bearer " prefix, which users may or may not copy. */
export const authorizationHeader = (apiKey: string) =>
  apiKey.startsWith("Bearer ") ? apiKey : `Bearer ${apiKey}`;

export class HardcoverError extends Error {
  override name = "HardcoverError";
}

export interface HardcoverClientOptions {
  apiKey: string;
  /** Request timeout in milliseconds. */
  timeoutMs?: number;
  fetch?: typeof fetch;
}

export interface SearchOptions {
  limit?: number;
}

export interface HardcoverClient {
  searchBooks(query: string, options?: SearchOptions): Promise<Book[]>;
}

interface GraphQLResponse<T> {
  data?: T | null;
  errors?: { message: string }[];
}

export function createHardcoverClient({
  apiKey,
  timeoutMs = 10_000,
  fetch: fetchImpl = fetch,
}: HardcoverClientOptions): HardcoverClient {
  const authorization = authorizationHeader(apiKey);

  async function request<D extends TadaDocumentNode<any, any>>(
    document: D,
    variables: VariablesOf<D>,
  ): Promise<ResultOf<D>> {
    const res = await fetchImpl(HARDCOVER_API_URL, {
      method: "POST",
      headers: {
        authorization,
        "content-type": "application/json",
        "user-agent": "TomeSearchBot (Telegram bot)",
      },
      body: JSON.stringify({ query: print(document), variables }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      throw new HardcoverError(`Hardcover API returned HTTP ${res.status} ${res.statusText}`);
    }
    const body = (await res.json()) as GraphQLResponse<ResultOf<D>>;
    if (body.errors?.length) {
      throw new HardcoverError(body.errors.map((e) => e.message).join("; "));
    }
    if (!body.data) throw new HardcoverError("Hardcover API returned no data");
    return body.data;
  }

  return {
    async searchBooks(query, { limit = 5 } = {}) {
      const trimmed = query.trim();
      if (!trimmed) return [];
      const data = await request(SearchBooksQuery, { query: trimmed, perPage: limit });
      if (data.search?.error) throw new HardcoverError(data.search.error);
      return parseSearchResults(data.search?.results).slice(0, limit);
    },
  };
}
