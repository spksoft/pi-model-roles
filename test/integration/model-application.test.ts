import assert from "node:assert/strict";
import { test } from "node:test";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { ConfigStore } from "../../src/config/store.js";
import { RolesController } from "../../src/pi/controller.js";
import { config } from "../support/fixtures.js";
import { sdkHarness } from "../support/sdk.js";

function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function harness(overrides: (pi: ExtensionAPI) => Partial<ExtensionAPI> = () => ({})) {
  let controller: RolesController | undefined;
  const h = await sdkHarness({
    roleExtension: false,
    extensions: [
      (pi) => {
        const dir = getAgentDir();
        controller = new RolesController(
          { ...pi, ...overrides(pi) },
          new ConfigStore(dir),
          dir,
          false,
          false,
        );
        const c = controller;
        pi.on("session_start", (event, ctx) => c.start(ctx, event.reason));
        pi.on("model_select", (_event, ctx) => c.externalChange(ctx, "model"));
        pi.on("thinking_level_select", (_event, ctx) => c.externalChange(ctx, "effort"));
        pi.on("session_shutdown", (_event, ctx) => c.shutdown(ctx));
      },
    ],
  });
  assert.ok(controller);
  const snapshot = controller.store.snapshot;
  assert.ok(snapshot);
  await controller.store.save(config(), snapshot.revision);
  return { h, c: controller };
}
const input = { type: "input", source: "interactive", text: "Synthetic task" } as const;

test("a failed configured default does not mask a usable inherited baseline", async () => {
  const { h, c } = await harness((pi) => ({
    setModel: async (model) => (model.id === "owner/fast" ? false : pi.setModel(model)),
  }));
  try {
    const snap = c.store.snapshot;
    assert.ok(snap);
    const settings = config();
    settings.roles.default = { model: { provider: "fixture", id: "owner/fast" }, effort: "low" };
    delete settings.roles.fast;
    await c.store.save(settings, snap.revision);
    assert.deepEqual(await c.input(input, h.context), { action: "continue" });
    assert.equal(c.lastDecision?.status, "selected");
    assert.equal(c.lastDecision?.reason, "apply_failed");
    assert.equal(c.lastDecision?.fallback, true);
    assert.equal(h.session.model?.id, "default");
    assert.equal(h.faux.state.callCount, 0);
  } finally {
    await h.close();
  }
});

test("manual changes during fallback authentication cancel the task and restore the pin", async () => {
  const entered = deferred();
  const release = deferred();
  const { h, c } = await harness((pi) => ({
    setModel: async (model) => {
      if (model.id === "default") {
        entered.resolve();
        await release.promise;
      }
      return pi.setModel(model);
    },
    setThinkingLevel: (effort) => {
      if (effort === "low") throw new Error("Synthetic effort failure");
      pi.setThinkingLevel(effort);
    },
  }));
  try {
    h.respond(fauxAssistantMessage('{"matches":["fast"]}'));
    const pending = c.input(input, h.context);
    await entered.promise;
    h.session.setThinkingLevel("medium");
    release.resolve();
    assert.deepEqual(await pending, { action: "handled" });
    assert.equal(h.session.model?.id, "owner/fast");
    assert.equal(h.session.thinkingLevel, "medium");
    assert.equal(c.mode, "manual");
    assert.equal(c.lastDecision, undefined);
  } finally {
    release.resolve();
    await h.close();
  }
});

test("controller ignores raw slash commands, queued work, extension input, and non-idle work", async () => {
  const { h, c } = await harness();
  try {
    for (const event of [
      { ...input, text: "/unknown-expansion" },
      { ...input, source: "extension" as const },
      { ...input, streamingBehavior: "steer" as const },
      { ...input, streamingBehavior: "followUp" as const },
    ])
      assert.deepEqual(await c.input(event, h.context), { action: "continue" });
    assert.deepEqual(await c.input(input, { ...h.context, isIdle: () => false }), {
      action: "continue",
    });
    assert.equal(h.faux.state.callCount, 0);
  } finally {
    await h.close();
  }
});

for (const failure of ["false", "throw", "effort"] as const)
  test(`application ${failure} restores default without leaking worker effort`, async () => {
    const { h, c } = await harness((pi) => ({
      setModel: async (model) => {
        if (model.id === "owner/fast" && failure === "false") return false;
        if (model.id === "owner/fast" && failure === "throw") throw new Error("Synthetic failure");
        return pi.setModel(model);
      },
      setThinkingLevel: (effort) => {
        if (failure === "effort" && effort === "low") throw new Error("Synthetic failure");
        pi.setThinkingLevel(effort);
      },
    }));
    try {
      h.respond(fauxAssistantMessage('{"matches":["fast"]}'));
      assert.deepEqual(await c.input(input, h.context), { action: "continue" });
      assert.equal(h.session.model?.id, "default");
      assert.equal(h.session.thinkingLevel, "high");
      assert.equal(c.lastDecision?.reason, "apply_failed");
      assert.equal(c.mode, "auto");
    } finally {
      await h.close();
    }
  });

test("late authentication cannot apply stale role effort; intervening manual pair is restored", async () => {
  const entered = deferred();
  const release = deferred();
  const efforts: string[] = [];
  const { h, c } = await harness((pi) => ({
    setModel: async (model) => {
      if (model.id === "owner/fast") {
        entered.resolve();
        await release.promise;
      }
      return pi.setModel(model);
    },
    setThinkingLevel: (effort) => {
      efforts.push(effort);
      pi.setThinkingLevel(effort);
    },
  }));
  try {
    h.respond(fauxAssistantMessage('{"matches":["fast"]}'));
    const pending = c.input(input, h.context);
    await entered.promise;
    h.session.setThinkingLevel("medium");
    release.resolve();
    assert.deepEqual(await pending, { action: "handled" });
    assert.equal(h.session.model?.id, "default");
    assert.equal(h.session.thinkingLevel, "medium");
    assert.equal(c.mode, "manual");
    assert.equal(efforts.includes("low"), false);
    assert.equal(c.lastDecision, undefined);
  } finally {
    release.resolve();
    await h.close();
  }
});

for (const change of ["manual", "reload", "tree", "shutdown"] as const)
  test(`pending classifier: ${change} invalidates selection and simultaneous input is not launched`, async () => {
    const entered = deferred();
    const release = deferred();
    const { h, c } = await harness();
    try {
      h.respond(async () => {
        entered.resolve();
        await release.promise;
        return fauxAssistantMessage('{"matches":["fast"]}');
      });
      const pending = c.input(input, h.context);
      await entered.promise;
      assert.deepEqual(await c.input(input, h.context), { action: "handled" });
      if (change === "manual") h.session.setThinkingLevel("medium");
      if (change === "reload") await c.reload(h.context);
      if (change === "tree") c.tree(h.context);
      if (change === "shutdown") c.shutdown(h.context);
      assert.deepEqual(await pending, { action: "handled" });
      release.resolve();
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(h.session.model?.id, "default");
      assert.equal(c.lastDecision, undefined);
      assert.equal(h.session.messages.length, 0);
      if (change === "shutdown") assert.equal(h.ui.statuses.has("model-roles"), false);
    } finally {
      release.resolve();
      await h.close();
    }
  });
