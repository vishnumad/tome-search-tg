import { InlineQueryResultBuilder } from "grammy";
import type { InlineQueryResult, LinkPreviewOptions } from "grammy/types";
import { bookSummaryLine, formatBookHtml } from "../format.ts";
import type { Book } from "../hardcover/types.ts";

export const usageText = (botUsername: string) =>
  "Search Hardcover for a book:\n" +
  "• /q <search term>\n" +
  `• Inline: type @${botUsername} <search term> in any chat and pick a result\n` +
  `• Guest mode: mention @${botUsername} <search term> in a chat I'm not a member of`;

/** Shows a small preview of the book page above the message, or none when there's no cover. */
const bookLinkPreview = (book: Book): LinkPreviewOptions =>
  book.coverUrl
    ? { url: book.url, prefer_small_media: true, show_above_text: true }
    : { is_disabled: true };

export const bookMessage = (book: Book) =>
  ({
    text: formatBookHtml(book),
    options: { parse_mode: "HTML", link_preview_options: bookLinkPreview(book) },
  }) as const;

export function bookToInlineResult(book: Book): InlineQueryResult {
  const { text, options } = bookMessage(book);
  return InlineQueryResultBuilder.article(String(book.id), book.title, {
    description: bookSummaryLine(book),
    ...(book.coverUrl && { thumbnail_url: book.coverUrl }),
  }).text(text, options);
}

/** A plain-text result, for usage hints, empty results and errors. */
export const messageResult = (id: string, title: string, text: string): InlineQueryResult =>
  InlineQueryResultBuilder.article(id, title, { description: text }).text(text);
