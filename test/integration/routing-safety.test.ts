import assert from "node:assert/strict";
import { test } from "node:test";
import { fauxAssistantMessage, type FauxResponseFactory } from "@earendil-works/pi-ai";
import { ConfigStore } from "../../src/config/store.js";
import { selectViaEvents } from "../../src/api/events.js";
import { readFile } from "node:fs/promises";
import { config } from "../support/fixtures.js";
import { sdkHarness } from "../support/sdk.js";

for (const mode of ["print", "json", "rpc", "tui"] as const)
  test(`configured ${mode === "tui" ? "child" : mode} stays inactive`, {
    timeout: 5000,
  }, async () => {
    const h = await sdkHarness({
      mode,
      child: mode === "tui",
      prepare: async (dir) => {
        const store = new ConfigStore(dir);
        const snapshot = await store.load(true);
        assert.ok(snapshot);
        const settings = config();
        settings.roles.default = {
          model: { provider: "fixture", id: "owner/fast" },
          effort: "low",
        };
        await store.save(settings, snapshot.revision);
      },
    });
    try {
      const store = new ConfigStore(h.dir);
      const before = await readFile(store.path, "utf8");
      const actual: string[] = [];
      h.respond((_context, options, _state, model) => {
        actual.push(`${model.id}:${options?.reasoning}`);
        return fauxAssistantMessage("Unrouted synthetic response");
      });
      await h.session.prompt("Synthetic configured non-primary task");
      assert.deepEqual(actual, ["default:high"]);
      assert.equal(h.faux.state.callCount, 1);
      const state = { model: { provider: "fixture", id: "default" }, effort: "high" as const };
      assert.equal(
        (
          await selectViaEvents(h.bus, h.context.sessionManager.getSessionId(), {
            task: "No automatic owner",
            current: state,
            baseline: state,
          })
        ).reason,
        "selector_unavailable",
      );
      assert.equal(await readFile(store.path, "utf8"), before);
      assert.deepEqual(h.errors, []);
    } finally {
      await h.close();
    }
  });

test("routing controls actual dispatch model and effort, not just session display", {
  timeout: 5000,
}, async () => {
  const h = await sdkHarness();
  try {
    const store = new ConfigStore(h.dir);
    const snapshot = await store.load();
    assert.ok(snapshot);
    await store.save(config(), snapshot.revision);
    await h.session.reload();
    const calls: Array<{ model: string; effort: string | undefined }> = [];
    const response =
      (text: string): FauxResponseFactory =>
      (_context, options, _state, model) => {
        calls.push({ model: model.id, effort: options?.reasoning });
        return fauxAssistantMessage(text);
      };
    h.respond(
      response('{"matches":["fast"]}'),
      response("First synthetic answer"),
      response('{"matches":[]}'),
      response("Second synthetic answer"),
    );
    await h.session.prompt("First synthetic task");
    await h.session.prompt("Second synthetic task");
    assert.deepEqual(calls, [
      { model: "default", effort: undefined },
      { model: "owner/fast", effort: "low" },
      { model: "default", effort: undefined },
      { model: "default", effort: "high" },
    ]);
    const answers = h.session.messages.filter((message) => message.role === "assistant");
    assert.deepEqual(
      answers.map((message) => message.stopReason),
      ["stop", "stop"],
    );
    assert.deepEqual(
      answers.map((message) => message.content),
      [
        [{ type: "text", text: "First synthetic answer" }],
        [{ type: "text", text: "Second synthetic answer" }],
      ],
    );
    assert.equal(h.session.model?.id, "default");
    assert.equal(h.session.thinkingLevel, "high");
    assert.deepEqual(h.errors, []);
  } finally {
    await h.close();
  }
});
