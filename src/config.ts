export interface Config {
  telegramBotToken: string;
  hardcoverApiKey: string;
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable ${name} (see .env)`);
  }
  return value;
}

export const loadHardcoverApiKey = () => requireEnv("HARDCOVER_API_KEY");

export function loadConfig(): Config {
  return {
    telegramBotToken: requireEnv("TELEGRAM_BOT_TOKEN"),
    hardcoverApiKey: loadHardcoverApiKey(),
  };
}
