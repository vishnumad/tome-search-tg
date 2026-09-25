import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MessageEntity } from "grammy/types";
import { extractGuestQuery } from "./query.ts";

const mention = (text: string, target: string): MessageEntity => ({
  type: "mention",
  offset: text.indexOf(target),
  length: target.length,
});

describe("extractGuestQuery", () => {
  it("removes the bot mention", () => {
    const text = "@TomeSearchBot the name of the wind";
    assert.equal(
      extractGuestQuery({ text, entities: [mention(text, "@TomeSearchBot")] }, "TomeSearchBot"),
      "the name of the wind",
    );
  });

  it("keeps other mentions and handles the mention mid-sentence", () => {
    const text = "hey @alice look up 🐉 @tomesearchbot dune";
    const entities = [mention(text, "@alice"), mention(text, "@tomesearchbot")];
    assert.equal(extractGuestQuery({ text, entities }, "TomeSearchBot"), "hey @alice look up 🐉 dune");
  });

  it("strips bot commands", () => {
    const text = "@TomeSearchBot /q dune";
    const entities: MessageEntity[] = [
      mention(text, "@TomeSearchBot"),
      { type: "bot_command", offset: text.indexOf("/q"), length: 2 },
    ];
    assert.equal(extractGuestQuery({ text, entities }, "TomeSearchBot"), "dune");
  });

  it("reads captions", () => {
    const caption = "@TomeSearchBot piranesi";
    assert.equal(
      extractGuestQuery({ caption, caption_entities: [mention(caption, "@TomeSearchBot")] }, "TomeSearchBot"),
      "piranesi",
    );
  });

  it("falls back to the replied-to message", () => {
    const text = "@TomeSearchBot";
    assert.equal(
      extractGuestQuery(
        { text, entities: [mention(text, text)], reply_to_message: { text: "Project Hail Mary" } },
        "TomeSearchBot",
      ),
      "Project Hail Mary",
    );
  });

  it("returns an empty string when there is nothing to search", () => {
    const text = "@TomeSearchBot";
    assert.equal(extractGuestQuery({ text, entities: [mention(text, text)] }, "TomeSearchBot"), "");
  });
});
