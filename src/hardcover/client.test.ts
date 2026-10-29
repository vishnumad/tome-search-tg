import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createHardcoverClient, HardcoverError } from "./client.ts";

function stubFetch(response: unknown, init: ResponseInit = { status: 200 }) {
  const calls: { headers: Headers; body: any }[] = [];
  const fetch = (async (_url: string, req: RequestInit) => {
    calls.push({ headers: new Headers(req.headers), body: JSON.parse(String(req.body)) });
    return new Response(JSON.stringify(response), init);
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

const hit = { document: { id: "7", title: "Dune", slug: "dune" } };

describe("createHardcoverClient", () => {
  it("adds the Bearer prefix when missing and sends variables", async () => {
    const { fetch, calls } = stubFetch({ data: { search: { error: null, results: { hits: [hit] } } } });
    const books = await createHardcoverClient({ apiKey: "hc_pat_x", fetch }).searchBooks("  dune ", { limit: 3 });
    assert.equal(books[0]?.title, "Dune");
    assert.equal(calls[0]?.headers.get("authorization"), "Bearer hc_pat_x");
    assert.deepEqual(calls[0]?.body.variables, { query: "dune", perPage: 3 });
    assert.match(calls[0]?.body.query, /search\(/);
  });

  it("does not double the Bearer prefix", async () => {
    const { fetch, calls } = stubFetch({ data: { search: { results: { hits: [] } } } });
    await createHardcoverClient({ apiKey: "Bearer hc_pat_x", fetch }).searchBooks("dune");
    assert.equal(calls[0]?.headers.get("authorization"), "Bearer hc_pat_x");
  });

  it("skips the request for blank queries", async () => {
    const { fetch, calls } = stubFetch({});
    assert.deepEqual(await createHardcoverClient({ apiKey: "k", fetch }).searchBooks("   "), []);
    assert.equal(calls.length, 0);
  });

  it("throws HardcoverError on GraphQL errors and HTTP failures", async () => {
    const gqlErr = stubFetch({ errors: [{ message: "bad token" }] });
    await assert.rejects(
      createHardcoverClient({ apiKey: "k", fetch: gqlErr.fetch }).searchBooks("dune"),
      (err) => err instanceof HardcoverError && err.message === "bad token",
    );
    const httpErr = stubFetch({}, { status: 500, statusText: "Server Error" });
    await assert.rejects(
      createHardcoverClient({ apiKey: "k", fetch: httpErr.fetch }).searchBooks("dune"),
      HardcoverError,
    );
  });
});

describe("searchSeries", () => {
  function sequenceFetch(responses: unknown[]) {
    const bodies: any[] = [];
    const fetch = (async (_url: string, req: RequestInit) => {
      bodies.push(JSON.parse(String(req.body)));
      return new Response(JSON.stringify(responses[bodies.length - 1]), { status: 200 });
    }) as typeof globalThis.fetch;
    return { fetch, bodies };
  }

  it("searches series, then fetches their books in search order", async () => {
    const row = (id: number, name: string) => ({ id, name, slug: name, books_count: 1, book_series: [] });
    const { fetch, bodies } = sequenceFetch([
      { data: { search: { error: null, ids: [2, 1], results: { hits: [{ document: { id: "2" } }, { document: { id: "1" } }] } } } },
      { data: { series: [row(1, "b"), row(2, "a")] } },
    ]);
    const series = await createHardcoverClient({ apiKey: "k", fetch }).searchSeries(" expanse ", { limit: 2 });
    assert.deepEqual(series.map((s) => s.name), ["a", "b"]);
    assert.deepEqual(bodies[0]?.variables, { query: "expanse", perPage: 2 });
    assert.match(bodies[0]?.query, /query_type: "Series"/);
    assert.deepEqual(bodies[1]?.variables.ids, [2, 1]);
  });

  it("skips the details request when nothing matches", async () => {
    const { fetch, bodies } = sequenceFetch([{ data: { search: { ids: [], results: { hits: [] } } } }]);
    assert.deepEqual(await createHardcoverClient({ apiKey: "k", fetch }).searchSeries("zzz"), []);
    assert.equal(bodies.length, 1);
  });
});
