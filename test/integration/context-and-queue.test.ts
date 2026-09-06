import assert from "node:assert/strict";
import { test } from "node:test";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { ConfigStore } from "../../src/config/store.js";
import { config } from "../support/fixtures.js";
import { sdkHarness } from "../support/sdk.js";

test("real SDK uses the selected smaller context model before pre-prompt compaction", async () => {
  let compactionModel: string | undefined;
  const h = await sdkHarness({
    extensions: [
      (pi) => {
        pi.on("session_before_compact", (_event, ctx) => {
          compactionModel = ctx.model?.id;
        });
      },
    ],
  });
  try {
    // Pi's built-in summarizer requires key/header auth with its default stream identity.
    // Use its public custom-stream seam for a deliberately auth-free native fake provider.
    h.session.agent.streamFunction = (model, context, options) =>
      h.runtime.streamSimple(model, context, options);
    h.respond(
      ...Array.from({ length: 8 }, () => fauxAssistantMessage("Synthetic context response")),
    );
    for (let turn = 0; turn < 8; turn++) await h.session.prompt("Synthetic history. ".repeat(3000));
    const store = new ConfigStore(h.dir);
    const snap = await store.load();
    assert.ok(snap);
    await store.save(config(), snap.revision);
    await h.session.reload();
    h.session.setAutoCompactionEnabled(true);
    const previous = h.session.messages.filter((message) => message.role === "assistant").at(-1);
    assert.ok(previous?.role === "assistant" && previous.usage.totalTokens > 100000);
    h.respond(
      (context, _options, _state, model) => {
        assert.equal(model.id, "default");
        assert.equal(context.messages.length, 1);
        return fauxAssistantMessage('{"matches":["fast"]}');
      },
      (_context, _options, _state, model) => {
        assert.equal(model.id, "owner/fast");
        return fauxAssistantMessage("## Goal\nSynthetic context summary");
      },
      (_context, _options, _state, model) => {
        assert.equal(model.id, "owner/fast");
        return fauxAssistantMessage("Synthetic split-turn prefix summary");
      },
      (context, _options, _state, model) => {
        assert.equal(model.id, "owner/fast");
        assert.doesNotMatch(context.systemPrompt ?? "", /Clear, mechanical tasks/);
        return fauxAssistantMessage("Final synthetic task answer");
      },
    );
    await h.session.prompt("Continue with a short well-specified task");
    assert.equal(h.faux.state.callCount, 12);
    assert.equal(compactionModel, "owner/fast");
    assert.ok(h.session.sessionManager.getBranch().some((entry) => entry.type === "compaction"));
    assert.deepEqual(h.errors, []);
  } finally {
    await h.close();
  }
});

test("real SDK queued follow-up remains on the active role without another selector", async () => {
  const h = await sdkHarness();
  try {
    const store = new ConfigStore(h.dir);
    const snap = await store.load();
    assert.ok(snap);
    await store.save(config(), snap.revision);
    await h.session.reload();
    h.respond(
      fauxAssistantMessage('{"matches":["fast"]}'),
      async (_context, _options, _state, model) => {
        assert.equal(model.id, "owner/fast");
        await h.session.prompt("Already queued continuation", { streamingBehavior: "followUp" });
        return fauxAssistantMessage("First execution response");
      },
      (_context, _options, _state, model) => {
        assert.equal(model.id, "owner/fast");
        return fauxAssistantMessage("Follow-up execution response");
      },
    );
    await h.session.prompt("Initial short task");
    await h.session.waitForIdle();
    assert.equal(h.faux.state.callCount, 3);
    assert.deepEqual(h.errors, []);
  } finally {
    await h.close();
  }
});
