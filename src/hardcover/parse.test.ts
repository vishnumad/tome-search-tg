import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { parseSearchResults } from "./parse.ts";

const fixture: unknown = JSON.parse(
  readFileSync(new URL("./fixtures/search-results.json", import.meta.url), "utf8"),
);

describe("parseSearchResults", () => {
  const books = parseSearchResults(fixture);
  const byId = (id: number) => {
    const book = books.find((b) => b.id === id);
    assert.ok(book, `book ${id} missing`);
    return book;
  };

  it("skips malformed hits and keeps order", () => {
    assert.deepEqual(
      books.map((b) => b.id),
      [369692, 439183, 2459845, 999001],
    );
  });

  it("maps a typical book", () => {
    const book = byId(369692);
    assert.equal(book.title, "Mistborn: The Final Empire");
    assert.equal(book.url, "https://hardcover.app/books/mistborn");
    assert.deepEqual(book.authors, ["Brandon Sanderson"]);
    assert.deepEqual(book.series, { name: "The Mistborn Saga: The Original Trilogy", position: "1", total: 3 });
    assert.ok(book.rating && book.rating > 4);
    assert.ok(book.ratingsCount > 0);
    assert.equal(book.releaseYear, 2006);
    assert.match(book.coverUrl ?? "", /^https:\/\/assets\.hardcover\.app\//);
  });

  it("keeps genres in relevance order", () => {
    assert.deepEqual(byId(439183).genres, ["Classics", "Fantasy", "Science Fiction", "Comics", "Dystopian"]);
  });

  it("dedupes genres case-insensitively and drops blanks", () => {
    assert.deepEqual(byId(999001).genres, ["Horror", "Mystery"]);
  });

  it("excludes illustrators and translators from authors", () => {
    assert.deepEqual(byId(439183).authors, ["Alan Moore"]);
  });

  it("strips HTML from descriptions", () => {
    const description = byId(2459845).description ?? "";
    assert.ok(description.startsWith('"In a hole in the ground there lived a hobbit." So begins'));
    assert.doesNotMatch(description, /<\/?i>/);
  });

  it("leaves invalid numeric entities as-is instead of failing the search", () => {
    const [book] = parseSearchResults({
      hits: [{ document: { id: 1, title: "T", slug: "t", description: "a &#99999999; b &#xD800; c &#x1F409;" } }],
    });
    assert.equal(book?.description, "a &#99999999; b &#xD800; c 🐉");
  });

  it("handles missing optional fields", () => {
    const book = byId(999001);
    assert.deepEqual(book.authors, ["Solo Writer"]);
    assert.equal(book.series, undefined);
    assert.equal(book.description, undefined);
    assert.equal(book.rating, undefined);
    assert.equal(book.ratingsCount, 0);
    assert.equal(book.releaseYear, undefined);
    assert.equal(book.coverUrl, undefined);
  });

  it("returns [] for empty or null results", () => {
    assert.deepEqual(parseSearchResults(null), []);
    assert.deepEqual(parseSearchResults({ hits: [] }), []);
    assert.deepEqual(parseSearchResults({ found: 0 }), []);
  });
});
