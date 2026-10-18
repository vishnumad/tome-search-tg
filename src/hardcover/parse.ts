import { z } from "zod";
import type { Book, Series } from "./types.ts";

const BOOK_URL_BASE = "https://hardcover.app/books/";

export const bookUrl = (slug: string) => `${BOOK_URL_BASE}${encodeURIComponent(slug)}`;

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
