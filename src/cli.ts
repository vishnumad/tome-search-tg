// Search Hardcover from the command line, without any Telegram involvement.
//   pnpm search "mistborn" [--series] [--limit N] [--json | --html]
import { parseArgs } from "node:util";
import { loadHardcoverApiKey } from "./config.ts";
import { bookSummaryLine, formatBookHtml, formatSeriesHtml, seriesSummaryLine } from "./format.ts";
import { createHardcoverClient } from "./hardcover/client.ts";
import { searchBooksAndSeries, type SearchResult } from "./search.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    limit: { type: "string", short: "n", default: "5" },
    series: { type: "boolean", short: "s", default: false },
    json: { type: "boolean", default: false },
    html: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

const query = positionals.join(" ").trim();
if (values.help || !query) {
  console.log('Usage: pnpm search "<search term>" [--series] [--limit N] [--json | --html]');
  process.exit(values.help ? 0 : 1);
}

const limit = Number(values.limit);
if (!Number.isInteger(limit) || limit < 1) {
  console.error("--limit must be a positive integer");
  process.exit(1);
}

const client = createHardcoverClient({ apiKey: loadHardcoverApiKey() });
interface Hit {
  title: string;
  summary: string;
  url: string;
  html: string;
}

const toHit = (result: SearchResult): Hit =>
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

// Same as the bot: books plus series whose name matches, or only series with --series.
const raw: SearchResult[] = values.series
  ? (await client.searchSeries(query, { limit })).map((series) => ({ kind: "series", series }))
  : await searchBooksAndSeries(client, query, { limit });
const hits = raw.map(toHit);

if (values.json) {
  console.log(JSON.stringify(raw, null, 2));
} else if (hits.length === 0) {
  console.log(`No ${values.series ? "series" : "books or series"} found for "${query}".`);
} else if (values.html) {
  console.log(hits.map((hit) => hit.html).join("\n\n---\n\n"));
} else {
  hits.forEach((hit, i) => {
    console.log(`${i + 1}. ${hit.title}`);
    console.log(`   ${hit.summary}`);
    console.log(`   ${hit.url}`);
  });
}
