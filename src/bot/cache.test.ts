import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { HardcoverClient } from "../hardcover/client.ts";
import { createCachedSearch } from "./cache.ts";

function countingClient(fail = false) {
  const queries: string[] = [];
  const client: HardcoverClient = {
    async searchBooks(query) {
      queries.push(query);
      if (fail) throw new Error("boom");
      return [];
    },
  };
  return { client, queries };
}

describe("createCachedSearch", () => {
  it("dedupes normalized queries", async () => {
    const { client, queries } = countingClient();
    const search = createCachedSearch(client, { limit: 10, ttlMs: 60_000, maxEntries: 10 });
    await Promise.all([search("Dune"), search("  dune  "), search("DUNE")]);
    assert.deepEqual(queries, ["dune"]);
  });

  it("does not cache failures", async () => {
    const { client, queries } = countingClient(true);
    const search = createCachedSearch(client, { limit: 10, ttlMs: 60_000, maxEntries: 10 });
    await assert.rejects(search("dune"));
    await assert.rejects(search("dune"));
    assert.equal(queries.length, 2);
  });

  it("evicts the oldest entry when full", async () => {
    const { client, queries } = countingClient();
    const search = createCachedSearch(client, { limit: 10, ttlMs: 60_000, maxEntries: 2 });
    await search("a");
    await search("b");
    await search("c");
    await search("a");
    assert.deepEqual(queries, ["a", "b", "c", "a"]);
  });
});
