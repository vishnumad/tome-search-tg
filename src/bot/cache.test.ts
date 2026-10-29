import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createCachedSearch } from "./cache.ts";

function countingSearch(fail = false) {
  const queries: string[] = [];
  const search = async (query: string) => {
    queries.push(query);
    if (fail) throw new Error("boom");
    return [];
  };
  return { search, queries };
}

describe("createCachedSearch", () => {
  it("dedupes normalized queries", async () => {
    const { search: fetchResults, queries } = countingSearch();
    const search = createCachedSearch(fetchResults, { ttlMs: 60_000, maxEntries: 10 });
    await Promise.all([search("Dune"), search("  dune  "), search("DUNE")]);
    assert.deepEqual(queries, ["dune"]);
  });

  it("does not cache failures", async () => {
    const { search: fetchResults, queries } = countingSearch(true);
    const search = createCachedSearch(fetchResults, { ttlMs: 60_000, maxEntries: 10 });
    await assert.rejects(search("dune"));
    await assert.rejects(search("dune"));
    assert.equal(queries.length, 2);
  });

  it("evicts the oldest entry when full", async () => {
    const { search: fetchResults, queries } = countingSearch();
    const search = createCachedSearch(fetchResults, { ttlMs: 60_000, maxEntries: 2 });
    await search("a");
    await search("b");
    await search("c");
    await search("a");
    assert.deepEqual(queries, ["a", "b", "c", "a"]);
  });
});
