import { InlineQueryResultBuilder } from "grammy";
import type { InlineQueryResult, LinkPreviewOptions } from "grammy/types";
import { bookSummaryLine, formatBookHtml, formatSeriesHtml, seriesSummaryLine } from "../format.ts";
import type { Book, SeriesDetails } from "../hardcover/types.ts";

export const usageText = (botUsername: string) =>
  "Search Hardcover for a book:\n" +
  "• /q <search term>\n" +
  `• Inline: type @${botUsername} <search term> in any chat and pick a result\n` +
  `• Guest mode: mention @${botUsername} <search term> in a chat I'm not a member of\n\n` +
  "Search for a series instead:\n" +
  "• /series <series name>\n" +
  `• Inline or guest mode: @${botUsername} series: <series name>`;

/** Shows the cover image above the message, or no preview when there's no cover. */
const coverLinkPreview = (coverUrl: string | undefined): LinkPreviewOptions =>
  coverUrl ? { url: coverUrl, prefer_large_media: true, show_above_text: true } : { is_disabled: true };

const htmlMessage = (text: string, coverUrl: string | undefined) =>
  ({ text, options: { parse_mode: "HTML", link_preview_options: coverLinkPreview(coverUrl) } }) as const;

export type Message = ReturnType<typeof htmlMessage>;

export const bookMessage = (book: Book): Message => htmlMessage(formatBookHtml(book), book.coverUrl);

export function bookToInlineResult(book: Book): InlineQueryResult {
  const { text, options } = bookMessage(book);
  return InlineQueryResultBuilder.article(String(book.id), book.title, {
    description: bookSummaryLine(book),
    ...(book.coverUrl && { thumbnail_url: book.coverUrl }),
  }).text(text, options);
}

/** Series have no cover of their own, so use the first book's. */
const seriesCover = (series: SeriesDetails) => series.books.find((b) => b.coverUrl)?.coverUrl;

export const seriesMessage = (series: SeriesDetails): Message =>
  htmlMessage(formatSeriesHtml(series), seriesCover(series));

export function seriesToInlineResult(series: SeriesDetails): InlineQueryResult {
  const { text, options } = seriesMessage(series);
  const cover = seriesCover(series);
  // Prefixed so series IDs never collide with book IDs.
  return InlineQueryResultBuilder.article(`series-${series.id}`, series.name, {
    description: seriesSummaryLine(series),
    ...(cover && { thumbnail_url: cover }),
  }).text(text, options);
}

/** A plain-text result, for usage hints, empty results and errors. */
export const messageResult = (id: string, title: string, text: string): InlineQueryResult =>
  InlineQueryResultBuilder.article(id, title, { description: text }).text(text);
