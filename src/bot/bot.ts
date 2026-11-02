import { Bot, GrammyError } from "grammy";
import type { HardcoverClient } from "../hardcover/client.ts";
import { search } from "../search.ts";
import { createCachedSearch } from "./cache.ts";
import { extractGuestQuery } from "./query.ts";
import { type Match, messageResult, toMatch, usageText } from "./results.ts";

const INLINE_RESULT_LIMIT = 10;
const SEARCH_FAILED_TEXT = "Sorry, searching Hardcover failed. Please try again in a bit.";
const noResultsText = (query: string) => `No books or series found for "${query}".`;

// Inline query answers must arrive within ~10s; stale ones are rejected by Telegram.
const isStaleQueryError = (err: unknown) =>
  err instanceof GrammyError && /query is too old|query ID is invalid/i.test(err.description);

export function createBot(token: string, hardcover: HardcoverClient): Bot {
  const bot = new Bot(token);
  const cachedSearch = createCachedSearch(
    async (query) => (await search(hardcover, query, { limit: INLINE_RESULT_LIMIT })).map(toMatch),
    { ttlMs: 5 * 60_000, maxEntries: 500 },
  );

  /** Returns undefined (after logging) when the search fails. */
  async function searchOrLog(query: string): Promise<Match[] | undefined> {
    try {
      return await cachedSearch(query);
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

    const matches = await searchOrLog(query);
    if (!matches) return ctx.reply(SEARCH_FAILED_TEXT, { reply_parameters });
    const [match] = matches;
    if (!match) return ctx.reply(noResultsText(query), { reply_parameters });

    await ctx.reply(match.message.text, { ...match.message.options, reply_parameters });
  });

  bot.on("inline_query", async (ctx) => {
    const query = ctx.inlineQuery.query.trim();
    try {
      if (!query) {
        await ctx.answerInlineQuery([], { cache_time: 0 });
        return;
      }
      const matches = await searchOrLog(query);
      if (!matches) {
        await ctx.answerInlineQuery([messageResult("error", "Search failed", SEARCH_FAILED_TEXT)], {
          cache_time: 0,
        });
        return;
      }
      await ctx.answerInlineQuery(matches.map((match) => match.inlineResult), { cache_time: 300 });
    } catch (err) {
      if (isStaleQueryError(err)) return;
      throw err;
    }
  });

  async function guestResult(query: string, botUsername: string) {
    if (!query) return messageResult("usage", `How to use @${botUsername}`, usageText(botUsername));
    const matches = await searchOrLog(query);
    if (!matches) return messageResult("error", "Search failed", SEARCH_FAILED_TEXT);
    const [match] = matches;
    return match ? match.inlineResult : messageResult("no-results", "No results", noResultsText(query));
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
