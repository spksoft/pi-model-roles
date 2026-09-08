import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mock, test } from "node:test";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { ConfigStore } from "../../src/config/store.js";
import { ConfigError } from "../../src/config/schema.js";
import { selectViaEvents } from "../../src/api/events.js";
import { config, request } from "../support/fixtures.js";
import { sdkHarness } from "../support/sdk.js";

async function conversationConfig(h: Awaited<ReturnType<typeof sdkHarness>>) {
  const store = new ConfigStore(h.dir);
  const snapshot = await store.load();
  assert.ok(snapshot);
  await store.save({ ...config(), selectorContext: "conversation" }, snapshot.revision);
  await h.session.reload();
  return store;
}

function selectorData(context: { messages: unknown[] }): Record<string, unknown> {
  const message = context.messages[0] as { content: Array<{ type: string; text: string }> };
  assert.equal(context.messages.length, 1);
  return JSON.parse(message.content[0]!.text);
}

test("real idle input supplies retained dialogue, continues the same role, and permits new task reclassification", async () => {
  const h = await sdkHarness();
  try {
    h.respond(fauxAssistantMessage("The label should be corrected; one occurrence remains."));
    await h.session.prompt("Change the label using these explicit acceptance criteria.");
    await conversationConfig(h);
    h.respond(
      (context) => {
        const data = selectorData(context);
        assert.equal(data.task, "Implement that correction.");
        assert.match(
          JSON.stringify(data.context),
          /explicit acceptance criteria|one occurrence remains/,
        );
        assert.doesNotMatch(JSON.stringify(data.context), /Implement that correction/);
        assert.doesNotMatch(JSON.stringify(context), /Synthetic fixture\. No tools\./);
        return fauxAssistantMessage('{"action":"classify","matches":["fast"]}');
      },
      fauxAssistantMessage("The correction is still in progress."),
      (context) => {
        assert.equal(
          (selectorData(context).context as { previousRole: string }).previousRole,
          "fast",
        );
        return fauxAssistantMessage('{"action":"continue","matches":[]}');
      },
      fauxAssistantMessage("Correction completed."),
      fauxAssistantMessage('{"action":"classify","matches":[]}'),
      fauxAssistantMessage("An unrelated task uses default."),
    );
    await h.session.prompt("Implement that correction.");
    assert.equal(h.session.model?.id, "owner/fast");
    await h.session.prompt("Continue");
    assert.equal(h.session.model?.id, "owner/fast");
    await h.session.prompt("/model-roles why");
    assert.match(h.ui.notifications.at(-1) ?? "", /Reason: continued/);
    assert.match(h.ui.notifications.at(-1) ?? "", /Prepared context: conversation/);
    assert.doesNotMatch(
      h.ui.notifications.at(-1) ?? "",
      /explicit acceptance criteria|correction is still/,
    );
    await h.session.prompt("Now consider a different architectural task.");
    assert.equal(h.session.model?.id, "default");
    assert.equal(h.faux.state.callCount, 7);
    const receipts = JSON.stringify(
      h.session.sessionManager.getBranch().filter((entry) => entry.type === "custom"),
    );
    assert.doesNotMatch(
      receipts,
      /explicit acceptance criteria|one occurrence|correction is still/,
    );
    assert.deepEqual(h.errors, []);
  } finally {
    await h.close();
  }
});

test("context consent cancellation writes nothing; accepting preserves enabled and allows rollback", async () => {
  const h = await sdkHarness();
  try {
    const store = new ConfigStore(h.dir);
    await h.session.prompt("/model-roles disable");
    const before = await readFile(store.path, "utf8");
    h.ui.answers.push(false);
    await h.session.prompt("/model-roles context conversation");
    assert.equal(await readFile(store.path, "utf8"), before);
    assert.match(
      h.ui.confirmations.at(-1)?.message ?? "",
      /selector provider.*differ from the execution provider/,
    );
    assert.match(h.ui.confirmations.at(-1)?.message ?? "", /not secret redaction/);
    h.ui.answers.push(true);
    await h.session.prompt("/model-roles context conversation");
    assert.equal((await store.load())?.config.selectorContext, "conversation");
    assert.equal(store.snapshot?.config.enabled, false);
    await h.session.prompt("/model-roles context prompt");
    assert.equal((await store.load())?.config.selectorContext, "prompt");
    assert.equal(h.faux.state.callCount, 0);
    assert.match(h.ui.statuses.get("model-roles") ?? "", /auto-selector=disabled/);
    assert.deepEqual(h.errors, []);
  } finally {
    await h.close();
  }
});

test("v1 event service stays prompt-only even when TUI context is conversation", async () => {
  const h = await sdkHarness();
  try {
    await conversationConfig(h);
    h.respond((context) => {
      assert.equal(selectorData(context).context, undefined);
      return fauxAssistantMessage('{"matches":["fast"]}');
    });
    const decision = await selectViaEvents(
      h.bus,
      h.session.sessionManager.getSessionId(),
      request(),
    );
    assert.equal(decision.reason, "matched");
    assert.equal(h.session.model?.id, "default");
  } finally {
    await h.close();
  }
});

test("command wrapper stays prompt-only after opting into idle-input conversation context", async () => {
  const calls: Array<string | undefined> = [];
  const h = await sdkHarness({
    extensions: [
      (pi) => {
        pi.registerCommand("synthetic-target", {
          description: "Fixture",
          handler: async (_args, ctx) => {
            calls.push(ctx.model?.id);
          },
        });
      },
    ],
  });
  try {
    h.respond(fauxAssistantMessage("PRIVATE_DIALOGUE_SENTINEL"));
    await h.session.prompt("A synthetic previous task");
    await conversationConfig(h);
    h.respond((context) => {
      assert.equal(selectorData(context).context, undefined);
      assert.doesNotMatch(JSON.stringify(context), /PRIVATE_DIALOGUE_SENTINEL/);
      return fauxAssistantMessage('{"matches":["fast"]}');
    });
    await h.session.prompt("/model-roles run /synthetic-target continue");
    assert.deepEqual(calls, ["owner/fast"]);
    assert.equal(h.faux.state.callCount, 2);
    assert.deepEqual(h.errors, []);
  } finally {
    await h.close();
  }
});

test("failed context save preserves prior policy and manual pause without disclosing raw errors", async () => {
  const h = await sdkHarness();
  try {
    await h.session.prompt("/model-roles disable");
    const store = new ConfigStore(h.dir);
    const before = await readFile(store.path, "utf8");
    h.ui.answers.push(true);
    mock.method(ConfigStore.prototype, "save", async () => {
      throw new ConfigError("conflict");
    });
    await h.session.prompt("/model-roles context conversation");
    assert.equal(await readFile(store.path, "utf8"), before);
    assert.equal((await store.load())?.config.selectorContext, undefined);
    await h.session.prompt("/model-roles why");
    assert.match(h.ui.notifications.at(-1) ?? "", /configured context: prompt/);
    assert.match(h.ui.statuses.get("model-roles") ?? "", /auto-selector=disabled/);
    assert.equal(h.faux.state.callCount, 0);
    assert.deepEqual(h.errors, []);
  } finally {
    mock.restoreAll();
    await h.close();
  }
});

test("history changes during the selector discard its result instead of using a stale antecedent", async () => {
  const h = await sdkHarness();
  try {
    await conversationConfig(h);
    h.respond((context) => {
      assert.ok(selectorData(context).context);
      h.session.sessionManager.appendCustomEntry("synthetic-navigation", { version: 1 });
      return fauxAssistantMessage('{"action":"classify","matches":["fast"]}');
    });
    await h.session.prompt("Implement the previous plan");
    assert.equal(h.session.model?.id, "default");
    assert.equal(h.faux.state.callCount, 1);
    assert.equal(h.ui.editor, "Implement the previous plan");
    assert.deepEqual(h.errors, []);
  } finally {
    await h.close();
  }
});
