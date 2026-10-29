import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bookSummaryLine,
  formatBookHtml,
  formatRatingsCount,
  formatSeries,
  formatSeriesHtml,
  seriesSummaryLine,
  truncate,
} from "./format.ts";
import type { Book, SeriesDetails } from "./hardcover/types.ts";

const book: Book = {
  id: 1,
  title: "Mistborn: The Final Empire",
  url: "https://hardcover.app/books/mistborn",
  authors: ["Brandon Sanderson"],
  series: { name: "The Mistborn Saga", position: "1", total: 3 },
  description: "For a thousand years the ash fell.",
  rating: 4.461995,
  ratingsCount: 5131,
  releaseYear: 2006,
  pages: 541,
  genres: ["Fantasy", "Epic Fantasy", "Magic", "Adventure", "Young Adult", "Dystopian"],
};

describe("truncate", () => {
  it("leaves short text alone", () => {
    assert.equal(truncate("short", 10), "short");
  });

  it("cuts at a word boundary within the limit", () => {
    const result = truncate("the quick brown fox jumps", 16);
    assert.equal(result, "the quick brown…");
    assert.ok(result.length <= 16);
  });
});

describe("formatSeries", () => {
  it("includes the total when known", () => {
    assert.equal(formatSeries({ name: "Hierarchy", position: "1", total: 2 }), "Hierarchy #1 of 2");
    assert.equal(formatSeries({ name: "Watchmen", position: "1-12", total: 12 }), "Watchmen #1-12 of 12");
  });

  it("omits the total when unknown or when the position falls outside it", () => {
    assert.equal(formatSeries({ name: "Hierarchy", position: "1" }), "Hierarchy #1");
    assert.equal(formatSeries({ name: "Mistborn", position: "3.5", total: 3 }), "Mistborn #3.5");
    assert.equal(formatSeries({ name: "Omnibus", position: "4-7", total: 3 }), "Omnibus #4-7");
  });

  it("omits the position when unknown", () => {
    assert.equal(formatSeries({ name: "Discworld", total: 41 }), "Discworld");
  });
});

describe("formatRatingsCount", () => {
  it("abbreviates counts of 1,000 and up", () => {
    assert.equal(formatRatingsCount(1), "1 rtg");
    assert.equal(formatRatingsCount(225), "225 rtgs");
    assert.equal(formatRatingsCount(1000), "1k rtgs");
    assert.equal(formatRatingsCount(5131), "5.1k rtgs");
    assert.equal(formatRatingsCount(48_213), "48k rtgs");
    assert.equal(formatRatingsCount(1_250_000), "1.3m rtgs");
  });
});

describe("formatBookHtml", () => {
  it("renders all fields", () => {
    assert.equal(
      formatBookHtml(book),
      [
        '<b><a href="https://hardcover.app/books/mistborn">Mistborn: The Final Empire</a></b>',
        "by Brandon Sanderson",
        "The Mistborn Saga #1 of 3",
        "4.46⭐ (5.1k rtgs) · 2006 · 541p",
        "<blockquote expandable>For a thousand years the ash fell.",
        "",
        "Fantasy · Epic Fantasy · Magic · Adventure · Young Adult</blockquote>",
      ].join("\n"),
    );
  });

  it("puts genres in the blockquote even without a description", () => {
    assert.match(
      formatBookHtml({ ...book, description: undefined }),
      /\n<blockquote expandable>Fantasy · [^<]+<\/blockquote>$/,
    );
  });

  it("omits missing fields", () => {
    const html = formatBookHtml({
      ...book,
      authors: [],
      series: undefined,
      description: undefined,
      rating: undefined,
      ratingsCount: 0,
      releaseYear: undefined,
      pages: undefined,
      genres: [],
    });
    assert.equal(html, '<b><a href="https://hardcover.app/books/mistborn">Mistborn: The Final Empire</a></b>');
  });

  it("escapes HTML in every field", () => {
    const html = formatBookHtml({
      ...book,
      title: "Tom & <Jerry>",
      authors: ["A & B"],
      description: "<script>&</script>",
      genres: ["Science Fiction & Fantasy"],
    });
    assert.match(html, /Tom &amp; &lt;Jerry&gt;/);
    assert.match(html, /by A &amp; B/);
    assert.match(
      html,
      /<blockquote expandable>&lt;script&gt;&amp;&lt;\/script&gt;\n\nScience Fiction &amp; Fantasy<\/blockquote>/,
    );
  });

  it("truncates before escaping so entities stay intact", () => {
    const html = formatBookHtml({ ...book, description: "&".repeat(50), genres: [] }, { descriptionLength: 10 });
    assert.match(html, new RegExp(`<blockquote expandable>${"&amp;".repeat(9)}…</blockquote>`));
  });

  it("stays under Telegram's message limit for long descriptions", () => {
    const html = formatBookHtml({ ...book, description: "word ".repeat(5000) });
    assert.ok(html.length < 4096);
  });
});

describe("bookSummaryLine", () => {
  it("joins available parts", () => {
    assert.equal(bookSummaryLine(book), "Brandon Sanderson · The Mistborn Saga #1 of 3 · 4.46⭐ · 2006");
    assert.equal(bookSummaryLine({ ...book, authors: [], series: undefined, rating: undefined }), "2006");
  });
});

const expanse: SeriesDetails = {
  id: 42,
  name: "The Expanse",
  url: "https://hardcover.app/series/the-expanse",
  author: "James S. A. Corey",
  description: "Space & politics",
  primaryBooksCount: 9,
  booksCount: 23,
  isCompleted: true,
  hasMoreBooks: false,
  books: [
    { title: "Leviathan Wakes", url: "https://hardcover.app/books/leviathan-wakes", position: "1", releaseYear: 2011, rating: 4.123 },
    { title: "Gods of Risk", url: "https://hardcover.app/books/gods-of-risk", position: "2.5" },
  ],
};

describe("formatSeriesHtml", () => {
  it("renders the series with its reading order", () => {
    assert.equal(
      formatSeriesHtml(expanse),
      [
        '<b><a href="https://hardcover.app/series/the-expanse">The Expanse</a></b>',
        "by James S. A. Corey",
        "9 books · 23 with extras · Complete",
        '<blockquote expandable>#1 <a href="https://hardcover.app/books/leviathan-wakes">Leviathan Wakes</a> · 2011 · 4.12⭐',
        '#2.5 <a href="https://hardcover.app/books/gods-of-risk">Gods of Risk</a></blockquote>',
        "<blockquote expandable>Space &amp; politics</blockquote>",
      ].join("\n"),
    );
  });

  it("links to Hardcover when the list was cut short, and skips missing parts", () => {
    const html = formatSeriesHtml({
      ...expanse,
      author: undefined,
      description: undefined,
      isCompleted: false,
      primaryBooksCount: undefined,
      booksCount: 1,
      hasMoreBooks: true,
    });
    assert.match(html, /^<b>.*<\/b>\n1 book · Ongoing\n<blockquote expandable>/);
    assert.match(html, /<a href="https:\/\/hardcover\.app\/series\/the-expanse">More on Hardcover<\/a><\/blockquote>$/);
  });
});

describe("seriesSummaryLine", () => {
  it("joins author, counts and completion", () => {
    assert.equal(seriesSummaryLine(expanse), "James S. A. Corey · 9 books · 23 with extras · complete");
    assert.equal(seriesSummaryLine({ ...expanse, author: undefined, isCompleted: false, booksCount: 9 }), "9 books");
  });
});
