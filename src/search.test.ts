import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { HardcoverClient } from "./hardcover/client.ts";
import type { Book, SeriesDetails, SeriesMatch } from "./hardcover/types.ts";
import { mixResults, normalizeTitle, search, seriesNameMatches } from "./search.ts";

const book = (id: number, title: string): Book => ({
  id,
  title,
  url: `https://hardcover.app/books/${id}`,
  authors: [],
  ratingsCount: 0,
  genres: [],
});

const series = (id: number, name: string): SeriesDetails => ({
  id,
  name,
  url: `https://hardcover.app/series/${id}`,
  booksCount: 1,
  books: [],
  hasMoreBooks: false,
});

const labels = (results: ReturnType<typeof mixResults>) =>
  results.map((r) => (r.kind === "book" ? `book:${r.book.title}` : `series:${r.series.name}`));

describe("normalizeTitle", () => {
  it("drops case, accents, punctuation and leading articles", () => {
    assert.equal(normalizeTitle("  The Expanse "), "expanse");
    assert.equal(normalizeTitle("Les Misérables"), "les miserables");
    assert.equal(normalizeTitle("A Song of Ice & Fire"), "song of ice fire");
    assert.equal(normalizeTitle("Theodore"), "theodore");
  });
});

describe("seriesNameMatches", () => {
  it("matches the full name, with or without the article", () => {
    assert.ok(seriesNameMatches("the expanse", "The Expanse"));
    assert.ok(seriesNameMatches("expanse", "The Expanse"));
    assert.ok(seriesNameMatches("dune", "Dune"));
  });

  it("matches a prefix once the query is long enough", () => {
    assert.ok(seriesNameMatches("the expan", "The Expanse"));
    assert.ok(seriesNameMatches("stormlight", "The Stormlight Archive"));
    assert.ok(!seriesNameMatches("the e", "The Expanse"));
  });

  it("ignores series that only matched on a book or author", () => {
    assert.ok(!seriesNameMatches("leviathan wakes", "The Expanse"));
    assert.ok(!seriesNameMatches("", "The Expanse"));
  });
});

describe("mixResults", () => {
  it("puts series before books", () => {
    const results = mixResults("the expanse", [book(1, "Leviathan Wakes")], [series(9, "The Expanse")]);
    assert.deepEqual(labels(results), ["series:The Expanse", "book:Leviathan Wakes"]);
  });

  it("keeps an exact title match first", () => {
    const results = mixResults("dune", [book(1, "Dune"), book(2, "Dune Messiah")], [series(9, "Dune")]);
    assert.deepEqual(labels(results), ["book:Dune", "series:Dune", "book:Dune Messiah"]);
  });

  it("handles empty lists", () => {
    assert.deepEqual(mixResults("x", [], []), []);
    assert.deepEqual(labels(mixResults("x", [], [series(1, "X")])), ["series:X"]);
  });
});

describe("search", () => {
  it("fetches only series whose name matches, at most two", async () => {
    const seriesMatches: SeriesMatch[] = [
      { id: 1, name: "The Expanse" },
      { id: 2, name: "Something Else" },
      { id: 3, name: "Expanse: Origins" },
      { id: 4, name: "The Expanse RPG" },
    ];
    const fetchedIds: number[][] = [];
    const client: HardcoverClient = {
      async searchBooksAndSeries() {
        return { books: [book(1, "Leviathan Wakes")], series: seriesMatches };
      },
      async getSeries(ids) {
        fetchedIds.push([...ids]);
        return ids.map((id) => series(id, seriesMatches.find((match) => match.id === id)!.name));
      },
    };
    const results = await search(client, "the expanse", { limit: 10 });
    assert.deepEqual(fetchedIds, [[1, 3]]);
    assert.deepEqual(labels(results), ["series:The Expanse", "series:Expanse: Origins", "book:Leviathan Wakes"]);
  });
});
