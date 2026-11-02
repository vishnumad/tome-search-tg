import type { HardcoverClient } from "./hardcover/client.ts";
import type { Book, SeriesDetails } from "./hardcover/types.ts";

export type SearchResult = { kind: "book"; book: Book } | { kind: "series"; series: SeriesDetails };

const SERIES_SEARCH_LIMIT = 5;
const MAX_SERIES_RESULTS = 2;
// Stops short queries like "the e" from prefix-matching every series that starts with "E".
const MIN_PREFIX_MATCH_LENGTH = 4;

export function normalizeTitle(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/^(the|a|an) /, "");
}

export function seriesNameMatches(query: string, name: string): boolean {
  const normalizedQuery = normalizeTitle(query);
  const normalizedName = normalizeTitle(name);
  if (!normalizedQuery) return false;
  return (
    normalizedName === normalizedQuery ||
    (normalizedQuery.length >= MIN_PREFIX_MATCH_LENGTH && normalizedName.startsWith(normalizedQuery))
  );
}

/** Series go first, unless the top book's title is the query itself ("dune" is the book before the series). */
export function mixResults(query: string, books: Book[], series: SeriesDetails[]): SearchResult[] {
  const toResult = (book: Book): SearchResult => ({ kind: "book", book });
  const seriesResults = series.map((s): SearchResult => ({ kind: "series", series: s }));
  const [topBook, ...otherBooks] = books;
  if (topBook && normalizeTitle(topBook.title) === normalizeTitle(query)) {
    return [toResult(topBook), ...seriesResults, ...otherBooks.map(toResult)];
  }
  return [...seriesResults, ...books.map(toResult)];
}

export async function search(client: HardcoverClient, query: string, { limit }: { limit: number }) {
  const { books, series } = await client.searchBooksAndSeries(query, {
    bookLimit: limit,
    seriesLimit: SERIES_SEARCH_LIMIT,
  });
  const matchingIds = series
    .filter((match) => seriesNameMatches(query, match.name))
    .slice(0, MAX_SERIES_RESULTS)
    .map((match) => match.id);
  return mixResults(query, books, await client.getSeries(matchingIds));
}
