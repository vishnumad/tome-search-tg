// Regenerates schema.graphql and src/hardcover/graphql-env.d.ts from the live Hardcover API.
// Run via `pnpm schema` (loads HARDCOVER_API_KEY from .env).
import { execFileSync } from "node:child_process";
import { loadHardcoverApiKey } from "../src/config.ts";
import { authorizationHeader, HARDCOVER_API_URL } from "../src/hardcover/client.ts";

const run = (...args: string[]) => execFileSync("gql.tada", args, { stdio: "inherit" });

run(
  "generate",
  "schema",
  HARDCOVER_API_URL,
  "--header",
  `authorization: ${authorizationHeader(loadHardcoverApiKey())}`,
  "--output",
  "schema.graphql",
);
run("generate", "output");
