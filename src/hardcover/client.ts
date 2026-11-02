import { print } from "graphql";
import type { TadaDocumentNode } from "gql.tada";
import { graphql, type ResultOf, type VariablesOf } from "./graphql.ts";
import { parseSearchResults, parseSeriesDetails, parseSeriesSearchResults } from "./parse.ts";
import type { Book, SeriesDetails, SeriesMatch } from "./types.ts";

export const HARDCOVER_API_URL = "https://api.hardcover.app/v1/graphql";

const SearchBooksAndSeriesQuery = graphql(`
  query SearchBooksAndSeries($query: String!, $bookLimit: Int!, $seriesLimit: Int!) {
    books: search(query: $query, query_type: "Book", per_page: $bookLimit, page: 1) {
      error
      results
    }
    series: search(query: $query, query_type: "Series", per_page: $seriesLimit, page: 1) {
      error
      results
    }
  }
`);

// Picks one book per position, skipping merged duplicates, partial editions and compilations,
// as recommended in https://docs.hardcover.app/api/guides/gettingbooksinseries/
const SeriesDetailsQuery = graphql(`
  query SeriesDetails($ids: [Int!]!, $bookLimit: Int!) {
    series(where: { id: { _in: $ids } }) {
      id
      name
      slug
      description
      is_completed
      books_count
      primary_books_count
      author {
        name
      }
      book_series(
        distinct_on: position
        order_by: [{ position: asc }, { book: { users_count: desc } }]
        where: {
          position: { _is_null: false }
          compilation: { _eq: false }
          book: { canonical_id: { _is_null: true }, is_partial_book: { _eq: false } }
        }
        limit: $bookLimit
      ) {
        position
        details
        book {
          title
          slug
          release_year
          rating
          image {
            url
          }
        }
      }
    }
  }
`);

// Keeps series messages within Telegram's length limit.
const SERIES_BOOK_LIMIT = 30;

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

export interface SearchLimits {
  bookLimit: number;
  seriesLimit: number;
}

export interface HardcoverClient {
  /** The search index has no reading order, so fetch series details with `getSeries`. */
  searchBooksAndSeries(query: string, limits: SearchLimits): Promise<{ books: Book[]; series: SeriesMatch[] }>;
  getSeries(ids: readonly number[]): Promise<SeriesDetails[]>;
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
    async searchBooksAndSeries(query, { bookLimit, seriesLimit }) {
      const trimmed = query.trim();
      if (!trimmed) return { books: [], series: [] };
      const data = await request(SearchBooksAndSeriesQuery, { query: trimmed, bookLimit, seriesLimit });
      const error = data.books?.error ?? data.series?.error;
      if (error) throw new HardcoverError(error);
      return {
        books: parseSearchResults(data.books?.results).slice(0, bookLimit),
        series: parseSeriesSearchResults(data.series?.results).slice(0, seriesLimit),
      };
    },

    async getSeries(ids) {
      if (ids.length === 0) return [];
      // The extra book shows whether the list was cut short.
      const data = await request(SeriesDetailsQuery, { ids: [...ids], bookLimit: SERIES_BOOK_LIMIT + 1 });
      return parseSeriesDetails(data.series, ids, { bookLimit: SERIES_BOOK_LIMIT });
    },
  };
}
