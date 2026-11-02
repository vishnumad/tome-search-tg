// Search Hardcover from the command line, without any Telegram involvement.
//   pnpm search "mistborn" [--limit N] [--json | --html]
import { parseArgs } from "node:util";
import { loadHardcoverApiKey } from "./config.ts";
import { bookSummaryLine, formatBookHtml, formatSeriesHtml, seriesSummaryLine } from "./format.ts";
import { createHardcoverClient } from "./hardcover/client.ts";
import { search, type SearchResult } from "./search.ts";

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
const results = await search(client, query, { limit });

const toMatch = (result: SearchResult) =>
  result.kind === "book"
    ? {
        title: result.book.title,
        summary: bookSummaryLine(result.book),
        url: result.book.url,
        html: formatBookHtml(result.book),
      }
    : {
        title: `${result.series.name} (series)`,
        summary: seriesSummaryLine(result.series),
        url: result.series.url,
        html: formatSeriesHtml(result.series),
      };
const matches = results.map(toMatch);

if (values.json) {
  console.log(JSON.stringify(results, null, 2));
} else if (matches.length === 0) {
  console.log(`No books or series found for "${query}".`);
} else if (values.html) {
  console.log(matches.map((match) => match.html).join("\n\n---\n\n"));
} else {
  matches.forEach((match, i) => {
    console.log(`${i + 1}. ${match.title}`);
    console.log(`   ${match.summary}`);
    console.log(`   ${match.url}`);
  });
}
