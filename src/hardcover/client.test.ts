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

const limits = { bookLimit: 3, seriesLimit: 2 };
const dune = { document: { id: "7", title: "Dune", slug: "dune" } };
const duneSeries = { document: { id: "4", name: "Dune" } };
const emptySearch = { data: { books: { results: { hits: [] } }, series: { results: { hits: [] } } } };

describe("searchBooksAndSeries", () => {
  it("adds the Bearer prefix when missing and sends variables", async () => {
    const { fetch, calls } = stubFetch({
      data: { books: { error: null, results: { hits: [dune] } }, series: { error: null, results: { hits: [duneSeries] } } },
    });
    const { books, series } = await createHardcoverClient({ apiKey: "hc_pat_x", fetch }).searchBooksAndSeries(
      "  dune ",
      limits,
    );
    assert.equal(books[0]?.title, "Dune");
    assert.deepEqual(series, [{ id: 4, name: "Dune" }]);
    assert.equal(calls[0]?.headers.get("authorization"), "Bearer hc_pat_x");
    assert.deepEqual(calls[0]?.body.variables, { query: "dune", ...limits });
  });

  it("does not double the Bearer prefix", async () => {
    const { fetch, calls } = stubFetch(emptySearch);
    await createHardcoverClient({ apiKey: "Bearer hc_pat_x", fetch }).searchBooksAndSeries("dune", limits);
    assert.equal(calls[0]?.headers.get("authorization"), "Bearer hc_pat_x");
  });

  it("skips the request for blank queries", async () => {
    const { fetch, calls } = stubFetch({});
    const client = createHardcoverClient({ apiKey: "k", fetch });
    assert.deepEqual(await client.searchBooksAndSeries("   ", limits), { books: [], series: [] });
    assert.equal(calls.length, 0);
  });

  it("throws HardcoverError on search errors, GraphQL errors and HTTP failures", async () => {
    const searchErr = stubFetch({ data: { books: { results: null }, series: { error: "index down" } } });
    await assert.rejects(
      createHardcoverClient({ apiKey: "k", fetch: searchErr.fetch }).searchBooksAndSeries("dune", limits),
      (err) => err instanceof HardcoverError && err.message === "index down",
    );
    const gqlErr = stubFetch({ errors: [{ message: "bad token" }] });
    await assert.rejects(
      createHardcoverClient({ apiKey: "k", fetch: gqlErr.fetch }).searchBooksAndSeries("dune", limits),
      (err) => err instanceof HardcoverError && err.message === "bad token",
    );
    const httpErr = stubFetch({}, { status: 500, statusText: "Server Error" });
    await assert.rejects(
      createHardcoverClient({ apiKey: "k", fetch: httpErr.fetch }).searchBooksAndSeries("dune", limits),
      HardcoverError,
    );
  });
});

describe("getSeries", () => {
  it("returns series in the order of the given IDs", async () => {
    const row = (id: number, name: string) => ({ id, name, slug: name, books_count: 1, numbered: [] });
    const { fetch, calls } = stubFetch({ data: { series: [row(1, "b"), row(2, "a")] } });
    const series = await createHardcoverClient({ apiKey: "k", fetch }).getSeries([2, 1]);
    assert.deepEqual(
      series.map((s) => s.name),
      ["a", "b"],
    );
    assert.deepEqual(calls[0]?.body.variables.ids, [2, 1]);
  });

  it("skips the request when there are no IDs", async () => {
    const { fetch, calls } = stubFetch({});
    assert.deepEqual(await createHardcoverClient({ apiKey: "k", fetch }).getSeries([]), []);
    assert.equal(calls.length, 0);
  });
});
