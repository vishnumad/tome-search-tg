import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { parseSearchResults, parseSeriesDetails, parseSeriesSearchIds } from "./parse.ts";

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
    assert.equal(book.pages, 541);
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
    assert.equal(book.pages, undefined);
    assert.equal(book.coverUrl, undefined);
  });

  it("returns [] for empty or null results", () => {
    assert.deepEqual(parseSearchResults(null), []);
    assert.deepEqual(parseSearchResults({ hits: [] }), []);
    assert.deepEqual(parseSearchResults({ found: 0 }), []);
  });
});

describe("parseSeriesSearchIds", () => {
  it("reads hit IDs in order, deduped", () => {
    const results = { hits: [{ document: { id: "3" } }, { document: { id: 1 } }, { document: { id: 3 } }, { document: {} }] };
    assert.deepEqual(parseSeriesSearchIds(results, [9]), [3, 1]);
  });

  it("falls back to the ids list", () => {
    assert.deepEqual(parseSeriesSearchIds(null, [5, null, 6]), [5, 6]);
    assert.deepEqual(parseSeriesSearchIds({ hits: [] }, null), []);
  });
});

describe("parseSeriesDetails", () => {
  const book = (position: number | null, title: string, extra: object = {}) => ({
    position,
    details: position == null ? null : String(position),
    book: { title, slug: title.toLowerCase().replace(/ /g, "-"), release_year: 2011, rating: 4.2, image: null, ...extra },
  });
  const expanse = {
    id: 42,
    name: " The Expanse ",
    slug: "the-expanse",
    description: "<p>Humanity has colonized the solar system.</p>",
    is_completed: true,
    books_count: 23,
    primary_books_count: 9,
    author: { name: "James S. A. Corey" },
    book_series: [
      book(1, "Leviathan Wakes", { image: { url: "https://assets.hardcover.app/lw.jpg" } }),
      book(1.5, "The Butcher of Anderson Station", { rating: "3.9", release_year: null }),
      book(2, "Caliban's War"),
      book(3, "Abaddon's Gate"),
      book(4, "", {}),
    ],
  };

  it("maps a series with its books in order", () => {
    const [series] = parseSeriesDetails([expanse], [42]);
    assert.deepEqual(series, {
      id: 42,
      name: "The Expanse",
      url: "https://hardcover.app/series/the-expanse",
      author: "James S. A. Corey",
      description: "Humanity has colonized the solar system.",
      primaryBooksCount: 9,
      booksCount: 23,
      isCompleted: true,
      hasMoreBooks: false,
      books: [
        {
          title: "Leviathan Wakes",
          url: "https://hardcover.app/books/leviathan-wakes",
          position: "1",
          releaseYear: 2011,
          rating: 4.2,
          coverUrl: "https://assets.hardcover.app/lw.jpg",
        },
        {
          title: "The Butcher of Anderson Station",
          url: "https://hardcover.app/books/the-butcher-of-anderson-station",
          position: "1.5",
          releaseYear: undefined,
          rating: 3.9,
          coverUrl: undefined,
        },
        {
          title: "Caliban's War",
          url: "https://hardcover.app/books/caliban's-war",
          position: "2",
          releaseYear: 2011,
          rating: 4.2,
          coverUrl: undefined,
        },
        {
          title: "Abaddon's Gate",
          url: "https://hardcover.app/books/abaddon's-gate",
          position: "3",
          releaseYear: 2011,
          rating: 4.2,
          coverUrl: undefined,
        },
      ],
    });
  });

  it("cuts long book lists and flags it", () => {
    const [series] = parseSeriesDetails([expanse], [42], { bookLimit: 2 });
    assert.deepEqual(series?.books.map((b) => b.position), ["1", "1.5"]);
    assert.equal(series?.hasMoreBooks, true);
  });

  it("orders by the given IDs and skips malformed rows", () => {
    const other = { ...expanse, id: 7, name: "Other", book_series: [] };
    const rows = [expanse, { id: 8, name: "Broken" }, other];
    assert.deepEqual(
      parseSeriesDetails(rows, [7, 8, 42]).map((s) => s.id),
      [7, 42],
    );
  });

  it("handles missing optional fields", () => {
    const [series] = parseSeriesDetails(
      [{ id: 1, name: "Solo", slug: "solo", books_count: 1, primary_books_count: 0, author: null, book_series: [] }],
      [1],
    );
    assert.equal(series?.author, undefined);
    assert.equal(series?.description, undefined);
    assert.equal(series?.primaryBooksCount, undefined);
    assert.equal(series?.isCompleted, undefined);
    assert.deepEqual(series?.books, []);
  });
});
