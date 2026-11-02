import { InlineQueryResultBuilder } from "grammy";
import type { InlineQueryResult, LinkPreviewOptions } from "grammy/types";
import { bookSummaryLine, formatBookHtml, formatSeriesHtml, seriesSummaryLine } from "../format.ts";
import type { Book, SeriesDetails } from "../hardcover/types.ts";
import type { SearchResult } from "../search.ts";

export const usageText = (botUsername: string) =>
  "Search Hardcover for a book or series:\n" +
  "• /q <search term>\n" +
  `• Inline: type @${botUsername} <search term> in any chat and pick a result\n` +
  `• Guest mode: mention @${botUsername} <search term> in a chat I'm not a member of`;

/** Shows the cover image above the message, or no preview when there's no cover. */
const coverLinkPreview = (coverUrl: string | undefined): LinkPreviewOptions =>
  coverUrl ? { url: coverUrl, prefer_large_media: true, show_above_text: true } : { is_disabled: true };

const htmlMessage = (text: string, coverUrl: string | undefined) =>
  ({ text, options: { parse_mode: "HTML", link_preview_options: coverLinkPreview(coverUrl) } }) as const;

export interface Match {
  message: ReturnType<typeof htmlMessage>;
  inlineResult: InlineQueryResult;
}

function bookMatch(book: Book): Match {
  const message = htmlMessage(formatBookHtml(book), book.coverUrl);
  const inlineResult = InlineQueryResultBuilder.article(String(book.id), book.title, {
    description: bookSummaryLine(book),
    ...(book.coverUrl && { thumbnail_url: book.coverUrl }),
  }).text(message.text, message.options);
  return { message, inlineResult };
}

function seriesMatch(series: SeriesDetails): Match {
  // Series have no cover of their own.
  const coverUrl = series.books.find((book) => book.coverUrl)?.coverUrl;
  const message = htmlMessage(formatSeriesHtml(series), coverUrl);
  // Prefixed so series IDs never collide with book IDs.
  const inlineResult = InlineQueryResultBuilder.article(`series-${series.id}`, series.name, {
    description: seriesSummaryLine(series),
    ...(coverUrl && { thumbnail_url: coverUrl }),
  }).text(message.text, message.options);
  return { message, inlineResult };
}

export const toMatch = (result: SearchResult): Match =>
  result.kind === "book" ? bookMatch(result.book) : seriesMatch(result.series);

/** A plain-text result, for usage hints, empty results and errors. */
export const messageResult = (id: string, title: string, text: string): InlineQueryResult =>
  InlineQueryResultBuilder.article(id, title, { description: text }).text(text);
