import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { test } from "node:test";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { ConfigStore } from "../../src/config/store.js";
import { STATE_ENTRY } from "../../src/pi/session-state.js";
import { config } from "../support/fixtures.js";
import { sdkHarness } from "../support/sdk.js";
test("real SDK: default-only startup, routing before execution, manual pause, reload, resume", async () => {
  const h = await sdkHarness();
  try {
    const store = new ConfigStore(h.dir);
    const initial = await store.load();
    assert.ok(initial);
    assert.deepEqual(Object.keys(initial.config.roles), ["default"]);
    assert.equal(h.faux.state.callCount, 0);
    h.respond(fauxAssistantMessage("default work"));
    await h.session.prompt("One role task");
    assert.equal(h.faux.state.callCount, 1);
    await store.save(config(), initial.revision);
    await h.session.reload();
    h.respond(
      (_context, _options, _state, model) => {
        assert.equal(model.id, "default");
        return fauxAssistantMessage('{"matches":["fast"]}');
      },
      (_context, _options, _state, model) => {
        assert.equal(model.id, "owner/fast");
        assert.equal(h.session.thinkingLevel, "low");
        return fauxAssistantMessage("fast work");
      },
    );
    await h.session.prompt("Clear mechanical task");
    assert.equal(h.session.model?.id, "owner/fast");
    assert.equal(h.faux.state.callCount, 3);
    assert.deepEqual(h.errors, []);
    await h.session.reload();
    const state = h.session.sessionManager
      .getBranch()
      .reverse()
      .find((entry) => entry.type === "custom" && entry.customType === STATE_ENTRY);
    assert.equal(state?.type === "custom" && (state.data as { mode: string }).mode, "auto");
    h.session.setThinkingLevel("high");
    h.respond(fauxAssistantMessage("manual"));
    await h.session.prompt("Manual pinned task");
    assert.equal(h.faux.state.callCount, 4);
    await h.session.prompt("/model-roles enable");
    h.respond(fauxAssistantMessage('{"matches":[]}'), (_context, _options, _state, model) => {
      assert.equal(model.id, "default");
      return fauxAssistantMessage("fallback");
    });
    await h.session.prompt("Ambiguous task");
    assert.equal(h.faux.state.callCount, 6);
    assert.deepEqual(h.errors, []);
  } finally {
    await h.close();
  }
});
test("real SDK: headless/child sessions bypass routing", async () => {
  for (const mode of ["json", "rpc", "print"] as const) {
    const h = await sdkHarness({ mode });
    try {
      assert.equal(await new ConfigStore(h.dir).load(), undefined);
      h.respond(fauxAssistantMessage("headless"));
      await h.session.prompt("Task");
      assert.equal(h.faux.state.callCount, 1);
    } finally {
      await h.close();
    }
  }
  const h = await sdkHarness({ child: true });
  try {
    assert.equal(await new ConfigStore(h.dir).load(), undefined);
    h.respond(fauxAssistantMessage("child"));
    await h.session.prompt("Task");
    assert.equal(h.faux.state.callCount, 1);
  } finally {
    await h.close();
  }
});
test("real SDK: loader cancellation prevents task execution and restores text", async () => {
  const h = await sdkHarness();
  try {
    const store = new ConfigStore(h.dir);
    const snap = await store.load();
    assert.ok(snap);
    await store.save(config(), snap.revision);
    await h.session.reload();
    h.ui.cancelSelection();
    h.respond(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return fauxAssistantMessage('{"matches":["fast"]}');
    });
    await h.session.prompt("Cancel this fixture task");
    assert.equal(h.ui.editor, "Cancel this fixture task");
    assert.equal(
      h.session.messages.some((message) => message.role === "user"),
      false,
    );
    assert.deepEqual(h.errors, []);
  } finally {
    await h.close();
  }
});
test("invalid configuration remains intact and does not block the current Pi model", async () => {
  const h = await sdkHarness();
  try {
    const store = new ConfigStore(h.dir);
    await writeFile(store.path, "version: 999\n");
    await h.session.reload();
    h.respond(fauxAssistantMessage("still usable"));
    await h.session.prompt("Task");
    assert.equal(await readFile(store.path, "utf8"), "version: 999\n");
    assert.equal(h.faux.state.callCount, 1);
  } finally {
    await h.close();
  }
});
