import assert from "node:assert/strict";
import { test } from "node:test";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { ConfigStore } from "../../src/config/store.js";
import { RolesController } from "../../src/pi/controller.js";
import { config } from "../support/fixtures.js";
import { sdkHarness } from "../support/sdk.js";

type Command = ReturnType<ExtensionAPI["getCommands"]>[number];
const TARGET = "/execute-plan synthetic-plan.html";

function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function harness(overrides: (pi: ExtensionAPI) => Partial<ExtensionAPI> = () => ({})) {
  const target: Command = {
    name: "execute-plan",
    source: "extension",
    sourceInfo: {
      path: "/synthetic/owner.ts",
      source: "fixture",
      scope: "temporary",
      origin: "top-level",
    },
  };
  const sent: Array<Parameters<ExtensionAPI["sendUserMessage"]>> = [];
  let controller: RolesController | undefined;
  const h = await sdkHarness({
    roleExtension: (pi) => {
      const dir = getAgentDir();
      const c = new RolesController(
        {
          ...pi,
          getCommands: () => [target],
          sendUserMessage: (...args) => {
            sent.push(args);
          },
          ...overrides(pi),
        },
        new ConfigStore(dir),
        dir,
        false,
        false,
      );
      controller = c;
      pi.on("session_start", (event, ctx) => c.start(ctx, event.reason));
      pi.on("model_select", (_event, ctx) => c.externalChange(ctx, "model"));
      pi.on("thinking_level_select", (_event, ctx) => c.externalChange(ctx, "effort"));
      pi.on("agent_start", () => c.agentStarted());
      pi.on("session_shutdown", (_event, ctx) => c.shutdown(ctx));
    },
  });
  assert.ok(controller);
  const snapshot = controller.store.snapshot;
  assert.ok(snapshot);
  await controller.store.save(config(), snapshot.revision);
  return { h, c: controller, target, sent };
}

for (const change of ["manual", "reload", "tree", "shutdown"] as const)
  test(`run never dispatches a stale command after ${change} during selection`, {
    timeout: 5000,
  }, async () => {
    const { h, c, sent } = await harness();
    const entered = deferred();
    const release = deferred();
    try {
      h.respond(async () => {
        entered.resolve();
        await release.promise;
        return fauxAssistantMessage('{"matches":["fast"]}');
      });
      const running = c.runCommand(h.context, TARGET);
      await entered.promise;
      await c.runCommand(h.context, TARGET);
      assert.deepEqual(sent, []);
      assert.equal(h.faux.state.callCount, 1);
      if (change === "manual") h.session.setThinkingLevel("medium");
      if (change === "reload") await c.reload(h.context);
      if (change === "tree") c.tree(h.context);
      if (change === "shutdown") c.shutdown(h.context);
      await running;
      assert.deepEqual(sent, []);
      assert.equal(h.session.model?.id, "default");
      if (change !== "shutdown") assert.equal(h.ui.editor, `/model-roles run ${TARGET}`);
    } finally {
      release.resolve();
      await h.close();
    }
  });

test("run checks ownership again even if the public metadata object was mutated in place", async () => {
  const { h, c, target, sent } = await harness();
  try {
    h.respond(() => {
      target.sourceInfo.path = "/synthetic/replacement.ts";
      return fauxAssistantMessage('{"matches":["fast"]}');
    });
    await c.runCommand(h.context, TARGET);
    assert.deepEqual(sent, []);
    assert.equal(h.ui.editor, `/model-roles run ${TARGET}`);
    assert.ok(h.ui.notifications.some((message) => /ownership changed/.test(message)));
  } finally {
    await h.close();
  }
});

test("an intervening agent start cancels command selection, even if that run settles first", {
  timeout: 5000,
}, async () => {
  const { h, c, sent } = await harness();
  const entered = deferred();
  const release = deferred();
  try {
    h.respond(async () => {
      entered.resolve();
      await release.promise;
      return fauxAssistantMessage('{"matches":["fast"]}');
    }, fauxAssistantMessage("Other extension's work"));
    const running = c.runCommand(h.context, TARGET);
    await entered.promise;
    await h.session.sendUserMessage("Unrelated generated task");
    assert.equal(h.context.isIdle(), true);
    await running;
    assert.deepEqual(sent, []);
    assert.equal(h.session.model?.id, "default");
    assert.deepEqual(h.errors, []);
  } finally {
    release.resolve();
    await h.close();
  }
});

test("manual changes during model application prevent dispatch and preserve the manual effort", {
  timeout: 5000,
}, async () => {
  const entered = deferred();
  const release = deferred();
  const { h, c, sent } = await harness((pi) => ({
    setModel: async (model) => {
      if (model.id === "owner/fast") {
        entered.resolve();
        await release.promise;
      }
      return pi.setModel(model);
    },
  }));
  try {
    h.respond(fauxAssistantMessage('{"matches":["fast"]}'));
    const running = c.runCommand(h.context, TARGET);
    await entered.promise;
    h.session.setThinkingLevel("medium");
    release.resolve();
    await running;
    assert.deepEqual(sent, []);
    assert.equal(h.session.model?.id, "default");
    assert.equal(h.session.thinkingLevel, "medium");
    assert.equal(h.ui.editor, `/model-roles run ${TARGET}`);
  } finally {
    release.resolve();
    await h.close();
  }
});

test("model application failure uses the existing fallback before one public dispatch", async () => {
  const { h, c, sent } = await harness((pi) => ({
    setModel: async (model) => (model.id === "owner/fast" ? false : pi.setModel(model)),
  }));
  try {
    h.respond(fauxAssistantMessage('{"matches":["fast"]}'));
    await c.runCommand(h.context, TARGET);
    assert.deepEqual(sent, [[TARGET, { expandPromptTemplates: true }]]);
    assert.equal(h.session.model?.id, "default");
    assert.equal(h.session.thinkingLevel, "high");
    assert.equal(c.lastDecision?.reason, "apply_failed");
  } finally {
    await h.close();
  }
});

test("pending queued work refuses run without a selector or dispatch", async () => {
  const { h, c, sent } = await harness();
  try {
    await c.runCommand({ ...h.context, hasPendingMessages: () => true }, TARGET);
    assert.deepEqual(sent, []);
    assert.equal(h.faux.state.callCount, 0);
  } finally {
    await h.close();
  }
});

test("dispatch errors are redacted and never trigger an automatic retry", async () => {
  let attempts = 0;
  const { h, c, sent } = await harness(() => ({
    sendUserMessage: () => {
      attempts++;
      throw new Error("SYNTHETIC_PRIVATE_HOST_ERROR");
    },
  }));
  try {
    h.respond(fauxAssistantMessage('{"matches":["fast"]}'));
    await c.runCommand(h.context, TARGET);
    assert.equal(attempts, 1);
    assert.deepEqual(sent, []);
    assert.equal(h.ui.editor, `/model-roles run ${TARGET}`);
    assert.doesNotMatch(h.ui.notifications.join("\n"), /SYNTHETIC_PRIVATE_HOST_ERROR/);
    assert.match(h.ui.notifications.join("\n"), /never retried automatically/);
  } finally {
    await h.close();
  }
});
