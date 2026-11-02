import type { Message } from "grammy/types";

type QuerySource = Pick<Message, "text" | "caption" | "entities" | "caption_entities">;

/** Removes mentions of the bot and bot commands from a message, returning the remaining text. */
export function stripBotMentions(message: QuerySource, botUsername: string): string {
  const text = message.text ?? message.caption ?? "";
  const entities = (message.text !== undefined ? message.entities : message.caption_entities) ?? [];
  const self = `@${botUsername}`.toLowerCase();

  // Entity offsets are UTF-16 code units, which matches JS string indexing.
  let result = text;
  const removable = entities
    .filter(
      (e) =>
        e.type === "bot_command" ||
        (e.type === "mention" && text.slice(e.offset, e.offset + e.length).toLowerCase() === self),
    )
    .sort((a, b) => b.offset - a.offset);
  for (const e of removable) {
    result = result.slice(0, e.offset) + " " + result.slice(e.offset + e.length);
  }
  return result.replace(/\s+/g, " ").trim();
}

/**
 * Extracts the search term from a guest-mode message ("@TomeSearchBot dune"). If the mention
 * carries no text, falls back to the message being replied to.
 */
export function extractGuestQuery(
  message: QuerySource & { reply_to_message?: QuerySource },
  botUsername: string,
): string {
  const query = stripBotMentions(message, botUsername);
  if (query || !message.reply_to_message) return query;
  return stripBotMentions(message.reply_to_message, botUsername);
}
