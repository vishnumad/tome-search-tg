import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bookSummaryLine, formatBookHtml, formatSeries, truncate } from "./format.ts";
import type { Book } from "./hardcover/types.ts";

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

describe("formatBookHtml", () => {
  it("renders all fields", () => {
    assert.equal(
      formatBookHtml(book),
      [
        '<b><a href="https://hardcover.app/books/mistborn">Mistborn: The Final Empire</a></b>',
        "by Brandon Sanderson",
        "The Mistborn Saga #1 of 3",
        "4.46⭐ (5,131 ratings) · 2006",
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
