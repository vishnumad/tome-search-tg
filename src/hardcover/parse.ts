import { z } from "zod";
import type { Book, Series, SeriesBook, SeriesDetails } from "./types.ts";

const BOOK_URL_BASE = "https://hardcover.app/books/";

const SERIES_URL_BASE = "https://hardcover.app/series/";

export const bookUrl = (slug: string) => `${BOOK_URL_BASE}${encodeURIComponent(slug)}`;
export const seriesUrl = (slug: string) => `${SERIES_URL_BASE}${encodeURIComponent(slug)}`;

// Only the fields we use; everything is lenient because the search index is loosely typed.
const optionalString = z.string().nullish();
const optionalNumber = z.number().nullish();

const documentSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(Number),
  title: z.string(),
  slug: z.string(),
  description: optionalString,
  rating: optionalNumber,
  ratings_count: optionalNumber,
  release_year: optionalNumber,
  pages: optionalNumber,
  image: z.object({ url: optionalString }).nullish(),
  author_names: z.array(z.string()).nullish(),
  genres: z.array(z.string()).nullish(),
  contributions: z
    .array(
      z.object({
        contribution: optionalString,
        author: z.object({ name: optionalString }).nullish(),
      }),
    )
    .nullish(),
  featured_series: z
    .object({
      details: optionalString,
      position: optionalNumber,
      series: z.object({ name: z.string(), primary_books_count: optionalNumber }).nullish(),
    })
    .nullish(),
});

const resultsSchema = z.object({
  hits: z.array(z.object({ document: z.unknown() })).default([]),
});

type Document = z.infer<typeof documentSchema>;

const nonEmpty = (s: string | null | undefined) => {
  const trimmed = s?.trim();
  return trimmed ? trimmed : undefined;
};

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

// Some descriptions contain stray HTML; reduce them to plain text.
function htmlToText(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/?[a-z][^>]*>/gi, "")
    .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
      if (code[0] === "#") {
        const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        // fromCodePoint throws past U+10FFFF, and lone surrogates would produce invalid UTF-8.
        const valid = n <= 0x10ffff && (n < 0xd800 || n > 0xdfff);
        return valid ? String.fromCodePoint(n) : entity;
      }
      return ENTITIES[code.toLowerCase()] ?? entity;
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

// `author_names` also lists illustrators, translators, narrators, etc.; prefer credited authors.
function parseAuthors(doc: Document): string[] {
  const authors = (doc.contributions ?? [])
    .filter((c) => c.contribution == null || c.contribution === "Author")
    .map((c) => nonEmpty(c.author?.name))
    .filter((name) => name !== undefined);
  const names = authors.length > 0 ? authors : (doc.author_names ?? []);
  return [...new Set(names)];
}

function parseSeries(doc: Document): Series | undefined {
  const featured = doc.featured_series;
  const name = nonEmpty(featured?.series?.name);
  if (!featured || !name) return undefined;
  const position =
    nonEmpty(featured.details) ?? (featured.position != null ? String(featured.position) : undefined);
  const total = featured.series?.primary_books_count || undefined;
  return { name, position, total };
}

// Genres are user-tagged, so casing varies ("Science Fiction" / "science fiction").
function parseGenres(doc: Document): string[] {
  const seen = new Set<string>();
  const genres: string[] = [];
  for (const genre of doc.genres ?? []) {
    const name = nonEmpty(genre);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    genres.push(name);
  }
  return genres;
}

function toBook(doc: Document): Book {
  return {
    id: doc.id,
    title: doc.title.trim(),
    url: bookUrl(doc.slug),
    authors: parseAuthors(doc),
    series: parseSeries(doc),
    description: nonEmpty(doc.description && htmlToText(doc.description)),
    rating: doc.rating || undefined,
    ratingsCount: doc.ratings_count ?? 0,
    releaseYear: doc.release_year ?? undefined,
    pages: doc.pages || undefined,
    coverUrl: nonEmpty(doc.image?.url),
    genres: parseGenres(doc),
  };
}

/** Parses the `jsonb` payload of `search(...).results`. Malformed hits are skipped. */
export function parseSearchResults(results: unknown): Book[] {
  if (results == null) return [];
  const { hits } = resultsSchema.parse(results);
  const books: Book[] = [];
  for (const hit of hits) {
    const parsed = documentSchema.safeParse(hit.document);
    if (parsed.success) books.push(toBook(parsed.data));
  }
  return books;
}

const idSchema = z.union([z.string(), z.number()]).transform(Number).pipe(z.number().int());

/**
 * Series IDs from a `query_type: "Series"` search, in relevance order. Reads the hits and falls
 * back to the top-level `ids` list.
 */
export function parseSeriesSearchIds(results: unknown, ids?: readonly (number | null)[] | null): number[] {
  const found: number[] = [];
  if (results != null) {
    for (const hit of resultsSchema.parse(results).hits) {
      const id = z.object({ id: idSchema }).safeParse(hit.document);
      if (id.success) found.push(id.data.id);
    }
  }
  if (found.length === 0) found.push(...(ids ?? []).filter((id) => id != null));
  return [...new Set(found)];
}

// Hasura returns `numeric` and `float8` as JSON numbers, but they're untyped scalars in gql.tada.
const numberLike = z.union([z.number(), z.string()]).transform(Number).pipe(z.number()).nullish().catch(null);

const seriesRowSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  description: optionalString,
  is_completed: z.boolean().nullish(),
  books_count: z.number(),
  primary_books_count: optionalNumber,
  author: z.object({ name: optionalString }).nullish(),
  book_series: z
    .array(
      z.object({
        position: numberLike,
        details: optionalString,
        book: z
          .object({
            title: optionalString,
            slug: optionalString,
            release_year: optionalNumber,
            rating: numberLike,
            image: z.object({ url: optionalString }).nullish(),
          })
          .nullish(),
      }),
    )
    .default([]),
});

function toSeriesBooks(rows: z.infer<typeof seriesRowSchema>["book_series"]): SeriesBook[] {
  const books: SeriesBook[] = [];
  for (const row of rows) {
    const title = nonEmpty(row.book?.title);
    const slug = nonEmpty(row.book?.slug);
    const position = nonEmpty(row.details) ?? (row.position != null ? String(row.position) : undefined);
    if (!title || !slug || !position) continue;
    books.push({
      title,
      url: bookUrl(slug),
      position,
      releaseYear: row.book?.release_year ?? undefined,
      rating: row.book?.rating || undefined,
      coverUrl: nonEmpty(row.book?.image?.url),
    });
  }
  return books;
}

/**
 * Maps rows of the `series` table to `SeriesDetails`, ordered like `ids`. Malformed rows are
 * skipped. Each series keeps at most `bookLimit` books.
 */
export function parseSeriesDetails(
  rows: readonly unknown[],
  ids: readonly number[],
  { bookLimit = Infinity }: { bookLimit?: number } = {},
): SeriesDetails[] {
  const byId = new Map<number, SeriesDetails>();
  for (const row of rows) {
    const parsed = seriesRowSchema.safeParse(row);
    if (!parsed.success) continue;
    const s = parsed.data;
    const books = toSeriesBooks(s.book_series);
    byId.set(s.id, {
      id: s.id,
      name: s.name.trim(),
      url: seriesUrl(s.slug),
      author: nonEmpty(s.author?.name),
      description: nonEmpty(s.description && htmlToText(s.description)),
      primaryBooksCount: s.primary_books_count || undefined,
      booksCount: s.books_count,
      isCompleted: s.is_completed ?? undefined,
      books: books.slice(0, bookLimit),
      hasMoreBooks: books.length > bookLimit,
    });
  }
  return ids.map((id) => byId.get(id)).filter((s) => s !== undefined);
}
