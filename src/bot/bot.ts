import { Bot, GrammyError } from "grammy";
import type { HardcoverClient } from "../hardcover/client.ts";
import type { Book } from "../hardcover/types.ts";
import { createCachedSearch } from "./cache.ts";
import { extractGuestQuery } from "./query.ts";
import { bookMessage, bookToInlineResult, messageResult, usageText } from "./results.ts";

const INLINE_RESULT_LIMIT = 10;
const SEARCH_FAILED_TEXT = "Sorry, searching Hardcover failed. Please try again in a bit.";
const noResultsText = (query: string) => `No books found for "${query}".`;

// Inline query answers must arrive within ~10s; stale ones are rejected by Telegram.
const isStaleQueryError = (err: unknown) =>
  err instanceof GrammyError && /query is too old|query ID is invalid/i.test(err.description);

export function createBot(token: string, hardcover: HardcoverClient): Bot {
  const bot = new Bot(token);
  const search = createCachedSearch(hardcover, {
    limit: INLINE_RESULT_LIMIT,
    ttlMs: 5 * 60_000,
    maxEntries: 500,
  });

  /** Returns undefined (after logging) when the search fails. */
  async function searchOrLog(query: string): Promise<Book[] | undefined> {
    try {
      return await search(query);
    } catch (err) {
      console.error(`Hardcover search failed for "${query}":`, err);
      return undefined;
    }
  }

  bot.command(["start", "help"], (ctx) => ctx.reply(usageText(ctx.me.username)));

  bot.command("q", async (ctx) => {
    const query = ctx.match.trim();
    const reply_parameters = { message_id: ctx.msg.message_id, allow_sending_without_reply: true };
    if (!query) return ctx.reply(usageText(ctx.me.username), { reply_parameters });

    const books = await searchOrLog(query);
    if (!books) return ctx.reply(SEARCH_FAILED_TEXT, { reply_parameters });
    const [book] = books;
    if (!book) return ctx.reply(noResultsText(query), { reply_parameters });

    const { text, options } = bookMessage(book);
    await ctx.reply(text, { ...options, reply_parameters });
  });

  bot.on("inline_query", async (ctx) => {
    const query = ctx.inlineQuery.query.trim();
    try {
      if (!query) {
        await ctx.answerInlineQuery([], { cache_time: 0 });
        return;
      }
      const books = await searchOrLog(query);
      if (!books) {
        await ctx.answerInlineQuery([messageResult("error", "Search failed", SEARCH_FAILED_TEXT)], {
          cache_time: 0,
        });
        return;
      }
      await ctx.answerInlineQuery(books.map(bookToInlineResult), { cache_time: 300 });
    } catch (err) {
      if (isStaleQueryError(err)) return;
      throw err;
    }
  });

  async function guestResult(query: string, botUsername: string) {
    if (!query) return messageResult("usage", `How to use @${botUsername}`, usageText(botUsername));
    const books = await searchOrLog(query);
    if (!books) return messageResult("error", "Search failed", SEARCH_FAILED_TEXT);
    const [book] = books;
    return book ? bookToInlineResult(book) : messageResult("no-results", "No results", noResultsText(query));
  }

  // Guest mode allows exactly one reply per mention, so always answer, even on failure.
  bot.on("guest_message", async (ctx) => {
    const query = extractGuestQuery(ctx.guestMessage, ctx.me.username);
    try {
      await ctx.answerGuestQuery(await guestResult(query, ctx.me.username));
    } catch (err) {
      console.error("answerGuestQuery failed, sending fallback reply:", err);
      await ctx.answerGuestQuery(messageResult("error", "Search failed", SEARCH_FAILED_TEXT));
    }
  });

  bot.catch(({ error, ctx }) => {
    console.error(`Error while handling update ${ctx.update.update_id}:`, error);
  });

  return bot;
}
