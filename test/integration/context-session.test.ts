import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import {
  createAgentSessionRuntime,
  createAgentSessionServices,
  createAgentSessionFromServices,
  SessionManager,
  type CreateAgentSessionRuntimeFactory,
} from "@earendil-works/pi-coding-agent";
import modelRoles from "../../src/extension.js";
import { ConfigStore } from "../../src/config/store.js";
import { contextOverride, setContextOverride } from "../../src/pi/context-policy.js";
import { config } from "../support/fixtures.js";
import { sdkHarness } from "../support/sdk.js";

test("session privacy override survives real SDK reload, tree, replacement/revisit and pause without override writes", async () => {
  const h = await sdkHarness({ roleExtension: false });
  const factory: CreateAgentSessionRuntimeFactory = async ({
    cwd,
    sessionManager,
    sessionStartEvent,
  }) => {
    const services = await createAgentSessionServices({
      cwd,
      agentDir: h.dir,
      modelRuntime: h.runtime,
      settingsManager: h.settings,
      resourceLoaderOptions: {
        noExtensions: true,
        noSkills: true,
        noThemes: true,
        noPromptTemplates: true,
        noContextFiles: true,
        extensionFactories: [modelRoles],
        systemPrompt: "Synthetic fixture",
      },
    });
    return {
      ...(await createAgentSessionFromServices({
        services,
        sessionManager,
        sessionStartEvent,
        model: h.faux.models[0],
        thinkingLevel: "high",
        noTools: "all",
      })),
      services,
      diagnostics: services.diagnostics,
    };
  };
  const runtime = await createAgentSessionRuntime(factory, {
    cwd: h.dir,
    agentDir: h.dir,
    sessionManager: SessionManager.create(h.dir, join(h.dir, "sessions")),
  });
  const bind = async (session: typeof runtime.session) => {
    await session.bindExtensions({
      mode: "tui",
      uiContext: h.ui.ui,
      onError: (error) => h.errors.push(error.error),
    });
  };
  runtime.setRebindSession(bind);
  await bind(runtime.session);
  try {
    const store = new ConfigStore(h.dir);
    const snapshot = await store.load();
    assert.ok(snapshot);
    await store.save({ ...config(), selectorContext: "conversation" }, snapshot.revision);
    await runtime.session.reload();
    const id = runtime.session.sessionId;
    const yaml = await readFile(store.path, "utf8");
    const entries = runtime.session.sessionManager.getEntries();
    await runtime.session.prompt("/model-roles context-session prompt");
    assert.deepEqual(runtime.session.sessionManager.getEntries(), entries);
    assert.equal(await readFile(store.path, "utf8"), yaml);
    assert.equal(contextOverride(h.dir, id).policy, "prompt");
    h.respond(fauxAssistantMessage('{"matches":[]}'), fauxAssistantMessage("Synthetic execution"));
    await runtime.session.prompt("A new synthetic task");
    const file = runtime.session.sessionFile;
    assert.ok(file);
    await runtime.session.reload();
    await runtime.session.prompt("/model-roles why");
    assert.match(h.ui.notifications.at(-1) ?? "", /effective context: prompt/);
    const user = runtime.session.sessionManager
      .getEntries()
      .find((entry) => entry.type === "message" && entry.message.role === "user");
    assert.ok(user);
    await runtime.session.navigateTree(user.id, { summarize: false });
    await runtime.session.prompt("/model-roles disable");
    await runtime.session.prompt("/model-roles enable");
    assert.equal(contextOverride(h.dir, id).policy, "prompt");
    await runtime.newSession();
    assert.equal(contextOverride(h.dir, runtime.session.sessionId).policy, undefined);
    await runtime.switchSession(file);
    assert.equal(runtime.session.sessionId, id);
    await runtime.session.prompt("/model-roles why");
    assert.match(h.ui.notifications.at(-1) ?? "", /effective context: prompt/);
    // Clone/fork gets a new UUID and global policy, not the original override.
    await runtime.fork(user.id, { position: "at" });
    assert.notEqual(runtime.session.sessionId, id);
    assert.equal(contextOverride(h.dir, runtime.session.sessionId).policy, undefined);
    assert.deepEqual(h.errors, []);
  } finally {
    await runtime.dispose();
    await h.close();
  }
});

test("session consent rejection, global masking, explicit inherit and cross-host change-then-revert", async () => {
  const h = await sdkHarness();
  try {
    const store = new ConfigStore(h.dir);
    const snapshot = await store.load();
    assert.ok(snapshot);
    await store.save({ ...config(), selectorContext: "conversation" }, snapshot.revision);
    await h.session.reload();
    await h.session.prompt("/model-roles context-session prompt");
    h.ui.answers.push(false);
    await h.session.prompt("/model-roles context-session inherit");
    assert.equal(contextOverride(h.dir, h.session.sessionId).policy, "prompt");
    assert.match(
      h.ui.confirmations.at(-1)?.message ?? "",
      /same UUID.*same agent directory.*process/,
    );
    h.ui.answers.push(true);
    await h.session.prompt("/model-roles context conversation");
    assert.equal(contextOverride(h.dir, h.session.sessionId).policy, "prompt");
    const before = await readFile(store.path, "utf8");
    h.respond(() => {
      // Same logical key is shared across hosts; even reverting the value changes its revision.
      setContextOverride(h.dir, h.session.sessionId, "conversation");
      setContextOverride(h.dir, h.session.sessionId, "prompt");
      return fauxAssistantMessage('{"matches":["fast"]}');
    });
    await h.session.prompt("Do not execute this stale decision");
    assert.equal(h.faux.state.callCount, 1);
    assert.equal(h.session.model?.id, "default");
    assert.equal(h.ui.editor, "Do not execute this stale decision");
    assert.equal(await readFile(store.path, "utf8"), before);
    h.ui.answers.push(true);
    await h.session.prompt("/model-roles context-session inherit");
    assert.equal(contextOverride(h.dir, h.session.sessionId).policy, undefined);
    await h.session.prompt("/model-roles why");
    assert.match(h.ui.notifications.at(-1) ?? "", /effective context: conversation/);
    assert.deepEqual(h.errors, []);
  } finally {
    await h.close();
  }
});
