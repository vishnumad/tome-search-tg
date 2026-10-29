# TomeSearchBot

Telegram bot that searches [Hardcover](https://hardcover.app) for books and series and posts their info.

- `/q <search term>` posts the top match
- Inline: type `@TomeSearchBot <search term>` in any chat and pick one of the results
- Guest mode: mention `@TomeSearchBot <search term>` in a chat the bot isn't a member of, and it replies with the top match
- Series: `/series <name>` (or `/s`), or prefix an inline or guest query with `series:` (`@TomeSearchBot series: the expanse`).
  The bot replies with the series' author, book count and reading order

## Setup

Requires Node 24+ (TypeScript runs natively, with no build step) and pnpm.

```sh
pnpm install
```

`.env` needs:

```
TELEGRAM_BOT_TOKEN=...
HARDCOVER_API_KEY=...   # from https://hardcover.app/account/api, with or without the "Bearer " prefix
```

In @BotFather, enable inline mode (`/setinline`) and guest mode ("Guest Mode" in the BotFather Mini App's
bot settings). To restrict who can use the bot, use Telegram's built-in bot access settings. On startup
the bot warns if inline or guest mode is disabled.

## Docker

```sh
docker compose up -d --build
```

Compose reads secrets from `.env` at runtime

## Scripts

| Command | Description |
| --- | --- |
| `pnpm start` | Run the bot (long polling) |
| `pnpm dev` | Run the bot, restarting on file changes |
| `pnpm search "<term>" [--series] [-n N] [--json \| --html]` | Search Hardcover from the CLI without Telegram. `--series` searches series instead of books. `--html` prints the exact Telegram message |
| `pnpm test` | Unit tests (`node --test`) |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm schema` | Regenerate `schema.graphql` and `src/hardcover/graphql-env.d.ts` from the live API |

## Layout

- `src/hardcover/`: Hardcover API client (gql.tada-typed queries) and parsing of search hits into `Book`s and `SeriesDetails`. A series search makes two requests: the search, then one `series` query for the matches' books in reading order. It has no Telegram dependencies.
- `src/format.ts`: renders a `Book` or a series as Telegram HTML.
- `src/bot/`: grammY bot. It has handlers for `/q`, `/series`, inline queries and guest messages, plus a small TTL cache in front of Hardcover, because inline queries fire on each keystroke.
- `src/cli.ts`, `src/main.ts`: entrypoints.
