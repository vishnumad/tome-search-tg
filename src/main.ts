import { createBot } from "./bot/bot.ts";
import { loadConfig } from "./config.ts";
import { createHardcoverClient } from "./hardcover/client.ts";

const config = loadConfig();
const bot = createBot(config.telegramBotToken, createHardcoverClient({ apiKey: config.hardcoverApiKey }));

await bot.init();
const me = bot.botInfo;
if (!me.supports_inline_queries) {
  console.warn("Inline mode is disabled for this bot. Enable it with /setinline in @BotFather.");
}
if (!me.supports_guest_queries) {
  console.warn('Guest mode is disabled for this bot. Enable "Guest Mode" in @BotFather\'s Mini App settings.');
}
await bot.api.setMyCommands([
  { command: "q", description: "Search Hardcover for a book" },
  { command: "series", description: "Search Hardcover for a series" },
]);

const stop = () => bot.stop();
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

await bot.start({
  allowed_updates: ["message", "inline_query", "guest_message"],
  onStart: ({ username }) => console.log(`@${username} is running`),
});
