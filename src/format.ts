import type { Book, Series, SeriesBook, SeriesDetails } from "./hardcover/types.ts";

// Telegram messages cap out at 4096 characters (after entity parsing). The description is
// collapsed in an expandable blockquote, so it can be long, but must leave room for the rest.
const DEFAULT_DESCRIPTION_LENGTH = 3000;
const GENRE_COUNT = 5;
const SERIES_DESCRIPTION_LENGTH = 1000;

export const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Truncates at a word boundary, appending an ellipsis when text was cut. */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  // Text gets maxLength - 1 characters plus the ellipsis. Searching the first maxLength characters
  // also catches a word that ends exactly at the budget (i.e. followed by a space).
  const lastSpace = text.slice(0, maxLength).search(/\s\S*$/);
  const cut = lastSpace > maxLength / 2 ? text.slice(0, lastSpace) : text.slice(0, maxLength - 1);
  return `${cut.trimEnd()}…`;
}

/** "Hierarchy #1 of 2". The total is skipped when the position falls outside it (e.g. novella "#3.5" of 3). */
export function formatSeries({ name, position, total }: Series): string {
  if (!position) return name;
  const numbers = position.match(/\d+(\.\d+)?/g)?.map(Number) ?? [];
  const showTotal = total && numbers.length > 0 && numbers.every((n) => n <= total);
  return `${name} #${position}${showTotal ? ` of ${total}` : ""}`;
}

export const formatRating = (rating: number) => `${rating.toFixed(2)}⭐`;

export const formatAuthors = (authors: string[]) => authors.join(", ");

const compactNumber = new Intl.NumberFormat("en-US", { notation: "compact" });

export const formatRatingsCount = (count: number) =>
  `${compactNumber.format(count).toLowerCase()} rtg${count === 1 ? "" : "s"}`;

/** One-line summary, used as the inline result description. */
export function bookSummaryLine(book: Book): string {
  const parts: string[] = [];
  if (book.authors.length) parts.push(formatAuthors(book.authors));
  if (book.series) parts.push(formatSeries(book.series));
  if (book.rating) parts.push(formatRating(book.rating));
  if (book.releaseYear) parts.push(String(book.releaseYear));
  return parts.join(" · ");
}

/** Telegram HTML message body for a book. */
export function formatBookHtml(
  book: Book,
  { descriptionLength = DEFAULT_DESCRIPTION_LENGTH }: { descriptionLength?: number } = {},
): string {
  const lines = [`<b><a href="${escapeHtml(book.url)}">${escapeHtml(book.title)}</a></b>`];
  if (book.authors.length) lines.push(`by ${escapeHtml(formatAuthors(book.authors))}`);
  if (book.series) lines.push(escapeHtml(formatSeries(book.series)));

  const stats: string[] = [];
  if (book.rating) {
    const count = book.ratingsCount ? ` (${formatRatingsCount(book.ratingsCount)})` : "";
    stats.push(`${formatRating(book.rating)}${count}`);
  }
  if (book.releaseYear) stats.push(String(book.releaseYear));
  if (book.pages) stats.push(`${book.pages}p`);
  if (stats.length) lines.push(stats.join(" · "));

  // Description and genres share a collapsed blockquote; genres only show once expanded.
  const details: string[] = [];
  if (book.description) {
    // Truncate before escaping so entities are never cut in half.
    details.push(escapeHtml(truncate(book.description, descriptionLength)));
  }
  if (book.genres.length) {
    details.push(escapeHtml(book.genres.slice(0, GENRE_COUNT).join(" · ")));
  }
  if (details.length) lines.push(`<blockquote expandable>${details.join("\n\n")}</blockquote>`);
  return lines.join("\n");
}

/** "9 books · 23 with extras" (the second part only when companions exist). */
export function formatSeriesCount({ primaryBooksCount, booksCount }: SeriesDetails): string {
  const main = primaryBooksCount ?? booksCount;
  const parts = [`${main} book${main === 1 ? "" : "s"}`];
  if (booksCount > main) parts.push(`${booksCount} with extras`);
  return parts.join(" · ");
}

/** One-line summary, used as the inline result description. */
export function seriesSummaryLine(series: SeriesDetails): string {
  const parts: string[] = [];
  if (series.author) parts.push(series.author);
  parts.push(formatSeriesCount(series));
  if (series.isCompleted) parts.push("complete");
  return parts.join(" · ");
}

function formatSeriesBookHtml(book: SeriesBook): string {
  const extras: string[] = [];
  if (book.releaseYear) extras.push(String(book.releaseYear));
  if (book.rating) extras.push(formatRating(book.rating));
  const link = `<a href="${escapeHtml(book.url)}">${escapeHtml(book.title)}</a>`;
  return `#${escapeHtml(book.position)} ${link}${extras.length ? ` · ${extras.join(" · ")}` : ""}`;
}

/** Telegram HTML message body for a series. */
export function formatSeriesHtml(series: SeriesDetails): string {
  const lines = [`<b><a href="${escapeHtml(series.url)}">${escapeHtml(series.name)}</a></b>`];
  if (series.author) lines.push(`by ${escapeHtml(series.author)}`);

  const stats = [formatSeriesCount(series)];
  if (series.isCompleted !== undefined) stats.push(series.isCompleted ? "Complete" : "Ongoing");
  lines.push(escapeHtml(stats.join(" · ")));

  // Both blockquotes are collapsed; the reading order shows its first few lines.
  if (series.books.length) {
    const books = series.books.map(formatSeriesBookHtml);
    if (series.hasMoreBooks) books.push(`<a href="${escapeHtml(series.url)}">More on Hardcover</a>`);
    lines.push(`<blockquote expandable>${books.join("\n")}</blockquote>`);
  }
  if (series.description) {
    const description = escapeHtml(truncate(series.description, SERIES_DESCRIPTION_LENGTH));
    lines.push(`<blockquote expandable>${description}</blockquote>`);
  }
  return lines.join("\n");
}
