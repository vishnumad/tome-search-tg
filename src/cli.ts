// Search Hardcover from the command line, without any Telegram involvement.
//   pnpm search "mistborn" [--limit N] [--json | --html]
import { parseArgs } from "node:util";
import { loadHardcoverApiKey } from "./config.ts";
import { bookSummaryLine, formatBookHtml } from "./format.ts";
import { createHardcoverClient } from "./hardcover/client.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    limit: { type: "string", short: "n", default: "5" },
    json: { type: "boolean", default: false },
    html: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

const query = positionals.join(" ").trim();
if (values.help || !query) {
  console.log('Usage: pnpm search "<search term>" [--limit N] [--json | --html]');
  process.exit(values.help ? 0 : 1);
}

const limit = Number(values.limit);
if (!Number.isInteger(limit) || limit < 1) {
  console.error("--limit must be a positive integer");
  process.exit(1);
}

const client = createHardcoverClient({ apiKey: loadHardcoverApiKey() });
const books = await client.searchBooks(query, { limit });

if (values.json) {
  console.log(JSON.stringify(books, null, 2));
} else if (books.length === 0) {
  console.log(`No books found for "${query}".`);
} else if (values.html) {
  console.log(books.map((book) => formatBookHtml(book)).join("\n\n---\n\n"));
} else {
  books.forEach((book, i) => {
    console.log(`${i + 1}. ${book.title}`);
    console.log(`   ${bookSummaryLine(book)}`);
    console.log(`   ${book.url}`);
  });
}
