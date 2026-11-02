import type { HardcoverClient } from "./hardcover/client.ts";
import type { Book, SeriesDetails } from "./hardcover/types.ts";

export type SearchResult = { kind: "book"; book: Book } | { kind: "series"; series: SeriesDetails };

/** Series hits checked for a name match. Only matching ones cost a details request. */
const SERIES_CANDIDATES = 5;
/** Most series shown in a mixed list. */
const MAX_SERIES = 2;
/** Shorter queries only match series names exactly, so "the e" doesn't pull in every "E…" series. */
const MIN_PREFIX_LENGTH = 4;

/** Lowercase, no accents or punctuation, no leading article: "The Expanse" → "expanse". */
export function normalizeTitle(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/^(the|a|an) /, "");
}

/**
 * True when the query names the series, fully or as a prefix ("the expan" → "The Expanse").
 * Series that only matched on a book title or author are left to the book results.
 */
export function seriesNameMatches(query: string, name: string): boolean {
  const q = normalizeTitle(query);
  const n = normalizeTitle(name);
  if (!q || !n) return false;
  return n === q || (q.length >= MIN_PREFIX_LENGTH && n.startsWith(q));
}

/**
 * Orders books and matching series into one list. Series go first, unless the top book's title
 * is exactly the query ("dune" is the book Dune before the Dune series).
 */
export function mixResults(query: string, books: Book[], series: SeriesDetails[]): SearchResult[] {
  const bookResults = books.map((book): SearchResult => ({ kind: "book", book }));
  const seriesResults = series.map((s): SearchResult => ({ kind: "series", series: s }));
  const [topBook] = books;
  if (topBook && normalizeTitle(topBook.title) === normalizeTitle(query)) {
    return [bookResults[0]!, ...seriesResults, ...bookResults.slice(1)];
  }
  return [...seriesResults, ...bookResults];
}

/** Searches books and series together, keeping only series whose name matches the query. */
export async function searchBooksAndSeries(
  client: HardcoverClient,
  query: string,
  { limit }: { limit: number },
): Promise<SearchResult[]> {
  const { books, series } = await client.searchBooksAndSeries(query, {
    bookLimit: limit,
    seriesLimit: SERIES_CANDIDATES,
  });
  const matching = series
    .filter((hit) => hit.name !== undefined && seriesNameMatches(query, hit.name))
    .slice(0, MAX_SERIES);
  let details: SeriesDetails[] = [];
  try {
    details = await client.getSeries(matching.map((hit) => hit.id));
  } catch (err) {
    // The books are still worth showing.
    console.error(`Fetching series for "${query}" failed:`, err);
  }
  return mixResults(query, books, details);
}
