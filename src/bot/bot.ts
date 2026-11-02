import { Bot, GrammyError } from "grammy";
import type { InlineQueryResult } from "grammy/types";
import type { HardcoverClient } from "../hardcover/client.ts";
import { searchBooksAndSeries, type SearchResult } from "../search.ts";
import { createCachedSearch } from "./cache.ts";
import { extractGuestQuery } from "./query.ts";
import {
  bookMessage,
  bookToInlineResult,
  type Message,
  messageResult,
  seriesMessage,
  seriesToInlineResult,
  usageText,
} from "./results.ts";

const INLINE_RESULT_LIMIT = 10;
const SEARCH_FAILED_TEXT = "Sorry, searching Hardcover failed. Please try again in a bit.";

/** Book searches also return series whose name matches; /series returns only series. */
type SearchKind = "mixed" | "series";

interface SearchQuery {
  kind: SearchKind;
  term: string;
}

const noResultsText = ({ kind, term }: SearchQuery) =>
  `No ${kind === "series" ? "series" : "books or series"} found for "${term}".`;

// Inline query answers must arrive within ~10s; stale ones are rejected by Telegram.
const isStaleQueryError = (err: unknown) =>
  err instanceof GrammyError && /query is too old|query ID is invalid/i.test(err.description);

/** A search hit, ready to send either as a message or as an inline result. */
interface Hit {
  message: Message;
  inline: InlineQueryResult;
}

const toHit = (result: SearchResult): Hit =>
  result.kind === "book"
    ? { message: bookMessage(result.book), inline: bookToInlineResult(result.book) }
    : { message: seriesMessage(result.series), inline: seriesToInlineResult(result.series) };

export function createBot(token: string, hardcover: HardcoverClient): Bot {
  const bot = new Bot(token);
  const cacheOptions = { ttlMs: 5 * 60_000, maxEntries: 500 };
  const searches: Record<SearchKind, (term: string) => Promise<Hit[]>> = {
    mixed: createCachedSearch(async (term) => {
      const results = await searchBooksAndSeries(hardcover, term, { limit: INLINE_RESULT_LIMIT });
      return results.map(toHit);
    }, cacheOptions),
    series: createCachedSearch(async (term) => {
      const series = await hardcover.searchSeries(term, { limit: INLINE_RESULT_LIMIT });
      return series.map((s) => toHit({ kind: "series", series: s }));
    }, cacheOptions),
  };

  /** Returns undefined (after logging) when the search fails. */
  async function searchOrLog({ kind, term }: SearchQuery): Promise<Hit[] | undefined> {
    try {
      return await searches[kind](term);
    } catch (err) {
      console.error(`Hardcover ${kind} search failed for "${term}":`, err);
      return undefined;
    }
  }

  bot.command(["start", "help"], (ctx) => ctx.reply(usageText(ctx.me.username)));

  const commands: [string[], SearchKind][] = [
    [["q"], "mixed"],
    [["series", "s"], "series"],
  ];
  for (const [names, kind] of commands) {
    bot.command(names, async (ctx) => {
      const query: SearchQuery = { kind, term: ctx.match.trim() };
      const reply_parameters = { message_id: ctx.msg.message_id, allow_sending_without_reply: true };
      if (!query.term) return ctx.reply(usageText(ctx.me.username), { reply_parameters });

      const hits = await searchOrLog(query);
      if (!hits) return ctx.reply(SEARCH_FAILED_TEXT, { reply_parameters });
      const [hit] = hits;
      if (!hit) return ctx.reply(noResultsText(query), { reply_parameters });

      await ctx.reply(hit.message.text, { ...hit.message.options, reply_parameters });
    });
  }

  bot.on("inline_query", async (ctx) => {
    const query: SearchQuery = { kind: "mixed", term: ctx.inlineQuery.query.trim() };
    try {
      if (!query.term) {
        await ctx.answerInlineQuery([], { cache_time: 0 });
        return;
      }
      const hits = await searchOrLog(query);
      if (!hits) {
        await ctx.answerInlineQuery([messageResult("error", "Search failed", SEARCH_FAILED_TEXT)], {
          cache_time: 0,
        });
        return;
      }
      await ctx.answerInlineQuery(
        hits.map((hit) => hit.inline),
        { cache_time: 300 },
      );
    } catch (err) {
      if (isStaleQueryError(err)) return;
      throw err;
    }
  });

  async function guestResult(text: string, botUsername: string) {
    const query: SearchQuery = { kind: "mixed", term: text };
    if (!query.term) return messageResult("usage", `How to use @${botUsername}`, usageText(botUsername));
    const hits = await searchOrLog(query);
    if (!hits) return messageResult("error", "Search failed", SEARCH_FAILED_TEXT);
    const [hit] = hits;
    return hit ? hit.inline : messageResult("no-results", "No results", noResultsText(query));
  }

  // Guest mode allows exactly one reply per mention, so always answer, even on failure.
  bot.on("guest_message", async (ctx) => {
    const text = extractGuestQuery(ctx.guestMessage, ctx.me.username);
    try {
      await ctx.answerGuestQuery(await guestResult(text, ctx.me.username));
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
