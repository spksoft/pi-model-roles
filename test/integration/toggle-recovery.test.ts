import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { readFile } from "node:fs/promises";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { ConfigStore } from "../../src/config/store.js";
import { ConfigError } from "../../src/config/schema.js";
import type { RolesController } from "../../src/pi/controller.js";
import { saveRoleConfig } from "../../src/ui/config-save.js";
import { config } from "../support/fixtures.js";
import { sdkHarness } from "../support/sdk.js";

for (const command of ["disable", "enable"])
  test(`failed ${command} leaves session paused and names the actual safe failure`, async () => {
    const h = await sdkHarness();
    try {
      const store = new ConfigStore(h.dir);
      const snapshot = await store.load();
      assert.ok(snapshot);
      await store.save(config(), snapshot.revision);
      await h.session.reload();
      const before = await readFile(store.path, "utf8");
      mock.method(ConfigStore.prototype, "setEnabled", async () => {
        throw new ConfigError("lock_busy");
      });
      await h.session.prompt(`/model-roles ${command}`);
      assert.match(h.ui.statuses.get("model-roles") ?? "", /auto-selector=disabled/);
      assert.match(
        h.ui.notifications.at(-1) ?? "",
        /disabled for this session; global setting was not saved.*lock_busy/,
      );
      assert.equal(await readFile(store.path, "utf8"), before);
      h.respond(fauxAssistantMessage("Still pinned, without a selector."));
      await h.session.prompt("Continue");
      assert.equal(h.faux.state.callCount, 1);
      assert.deepEqual(h.errors, []);
    } finally {
      mock.restoreAll();
      await h.close();
    }
  });

test("stale already-enabled command preserves external roles and really enables disk state", async () => {
  const h = await sdkHarness();
  try {
    const store = new ConfigStore(h.dir);
    const snapshot = await store.load();
    assert.ok(snapshot);
    await store.save({ ...config(), enabled: false }, snapshot.revision);
    await h.session.prompt("/model-roles enable");
    const after = await store.load();
    assert.deepEqual(after?.config, config());
    assert.match(h.ui.statuses.get("model-roles") ?? "", /auto-selector=enabled/);
    assert.equal(h.faux.state.callCount, 0);
  } finally {
    await h.close();
  }
});

test("an enable save cannot resume over an intervening manual choice", {
  timeout: 5000,
}, async () => {
  function deferred() {
    let resolve = () => {};
    const promise = new Promise<void>((done) => {
      resolve = done;
    });
    return { promise, resolve };
  }
  const entered = deferred();
  const release = deferred();
  const h = await sdkHarness();
  const original = ConfigStore.prototype.setEnabled;
  try {
    await h.session.prompt("/model-roles disable");
    mock.method(
      ConfigStore.prototype,
      "setEnabled",
      async function (this: ConfigStore, enabled: boolean) {
        entered.resolve();
        await release.promise;
        return original.call(this, enabled);
      },
    );
    const pending = h.session.prompt("/model-roles enable");
    await entered.promise;
    h.session.setThinkingLevel("low");
    release.resolve();
    await pending;
    assert.equal((await new ConfigStore(h.dir).load())?.config.enabled, true);
    assert.equal(h.session.thinkingLevel, "low");
    assert.match(h.ui.statuses.get("model-roles") ?? "", /auto-selector=disabled/);
    assert.match(h.ui.notifications.at(-1) ?? "", /intervening session changes were preserved/);
    assert.equal(h.faux.state.callCount, 0);
    assert.deepEqual(h.errors, []);
  } finally {
    release.resolve();
    mock.restoreAll();
    await h.close();
  }
});

test("post-save status or notification failure does not report an uncommitted save", async () => {
  for (const failing of ["status", "notify"]) {
    const notices: string[] = [];
    let committed = false;
    const controller = {
      invalidate() {},
      store: {
        path: "fixture/config.yaml",
        async save() {
          committed = true;
        },
      },
      status() {
        if (failing === "status") throw new Error("PRIVATE_UI_SENTINEL");
      },
    } as unknown as RolesController;
    const ctx = {
      ui: {
        notify(text: string) {
          if (failing === "notify" && text.startsWith("Model roles saved."))
            throw new Error("PRIVATE_UI_SENTINEL");
          notices.push(text);
        },
      },
    } as unknown as ExtensionContext;
    assert.equal(await saveRoleConfig(controller, ctx, config(), "fixture"), true);
    assert.equal(committed, true);
    assert.match(notices.join(" "), /were saved, but/);
    assert.doesNotMatch(notices.join(" "), /Could not save|PRIVATE_UI_SENTINEL/);
  }
});
