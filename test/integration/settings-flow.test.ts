import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai";
import { ConfigStore } from "../../src/config/store.js";
import { sdkHarness } from "../support/sdk.js";

const draft = [
  "fast",
  "Use for short, well-specified tasks.\nคำอธิบาย",
  "fixture/owner/fast",
  "low",
  true,
  true,
] as const;
test("removed model-roles subcommands show the bounded command surface", async () => {
  const h = await sdkHarness();
  try {
    for (const command of ["status", "reload", "pause", "auto", "auto-setup"]) {
      await h.session.prompt(`/model-roles ${command}`);
    }
    assert.equal(h.faux.state.callCount, 0);
    assert.equal(
      h.ui.notifications.filter((message) => message.includes("/model-roles settings")).length,
      5,
    );
    assert.deepEqual(h.errors, []);
  } finally {
    await h.close();
  }
});

test("native menu: cancelling every add step leaves configuration and model untouched", async () => {
  const h = await sdkHarness();
  try {
    const store = new ConfigStore(h.dir);
    const before = await readFile(store.path, "utf8");
    for (let step = 0; step < draft.length; step++) {
      h.ui.customAnswers.push({ type: "add" });
      if (step >= 2) h.ui.customAnswers.push({ keys: step === 2 ? ["\u001b"] : [draft[2], "\r"] });
      h.ui.customAnswers.push({ type: "close" });
      h.ui.answers.push(...draft.slice(0, step).filter((_value, index) => index !== 2));
      if (step !== 2) h.ui.answers.push(undefined);
      await h.session.prompt("/model-roles");
      assert.equal(await readFile(store.path, "utf8"), before, `cancel step ${step}`);
      assert.equal(h.session.model?.id, "default");
      assert.equal(h.faux.state.callCount, 0);
    }
    assert.deepEqual(h.errors, []);
  } finally {
    await h.close();
  }
});

test("native menu: create, edit, delete, override default, and command-level role use", async () => {
  const h = await sdkHarness();
  try {
    const store = new ConfigStore(h.dir);
    h.ui.customAnswers.push({ type: "add" }, { keys: [draft[2], "\r"] }, { type: "close" });
    h.ui.answers.push(...draft.filter((_value, index) => index !== 2));
    await h.session.prompt("/model-roles");
    let snap = await store.load();
    assert.ok(snap);
    assert.deepEqual(Object.keys(snap.config.roles), ["default", "fast"]);
    const fast = snap.config.roles.fast;
    assert.ok(fast);
    assert.equal(fast.effort, "low");
    h.ui.answers.push("Updated selection criteria", "medium", true);
    h.ui.customAnswers.push(
      { type: "edit", id: "fast" },
      { keys: ["fixture/owner/fast", "\r"] },
      { type: "close" },
    );
    await h.session.prompt("/model-roles");
    snap = await store.load();
    assert.ok(snap);
    assert.equal(snap.config.roles.fast?.effort, "medium");
    await h.session.prompt("/model-roles use fast");
    assert.equal(h.session.model?.id, "owner/fast");
    assert.equal(h.session.thinkingLevel, "medium");
    assert.match(h.ui.statuses.get("model-roles") ?? "", /auto-selector=enabled role=fast/);
    await h.session.prompt("/model-roles disable");
    assert.match(h.ui.statuses.get("model-roles") ?? "", /auto-selector=disabled role=fast/);
    await h.session.prompt("/model-roles enable");
    assert.match(h.ui.statuses.get("model-roles") ?? "", /auto-selector=enabled/);
    const changed = snap.config.roles.fast;
    assert.ok(changed);
    h.ui.customAnswers.push({ type: "delete", id: "fast" }, { type: "close" });
    h.ui.answers.push(true);
    await h.session.prompt("/model-roles");
    snap = await store.load();
    assert.ok(snap);
    assert.deepEqual(Object.keys(snap.config.roles), ["default"]);
    h.ui.customAnswers.push(
      { type: "edit", id: "default" },
      { keys: ["fixture/owner/fast", "\r"] },
      { type: "close" },
    );
    h.ui.answers.push("high", true);
    await h.session.prompt("/model-roles");
    snap = await store.load();
    assert.ok(snap);
    assert.equal(snap.config.roles.default.effort, "high");
    assert.equal(
      h.ui.selections.some((row) => row.title === "Role: default"),
      false,
    );
    await assert.rejects(readFile(`${h.dir}/settings.json`), { code: "ENOENT" });
    assert.equal(h.faux.state.callCount, 0);
    assert.deepEqual(h.errors, []);
  } finally {
    await h.close();
  }
});

test("using a role preserves Auto Selector state and disabling pins that role", async () => {
  const h = await sdkHarness();
  try {
    const store = new ConfigStore(h.dir);
    const snapshot = await store.load();
    assert.ok(snapshot);
    const configured = structuredClone(snapshot.config);
    configured.roles.fast = {
      model: { provider: "fixture", id: "owner/fast" },
      effort: "low",
      description: "Use when the task is a small, explicit change with no design work.",
    };
    await store.save(configured, snapshot.revision);
    await h.session.reload();

    await h.session.prompt("/model-roles use fast");
    assert.match(h.ui.statuses.get("model-roles") ?? "", /auto-selector=enabled role=fast/);
    h.respond(
      fauxAssistantMessage('{"matches":[]}'),
      fauxAssistantMessage("Default role handled the next task."),
    );
    await h.session.prompt("A task that does not match the fast role");
    assert.equal(h.session.model?.id, "default");
    assert.equal(h.faux.state.callCount, 2);

    await h.session.prompt("/model-roles use fast");
    await h.session.prompt("/model-roles disable");
    assert.match(h.ui.statuses.get("model-roles") ?? "", /auto-selector=disabled role=fast/);
    h.respond(fauxAssistantMessage("Pinned role handled the task."));
    await h.session.prompt("Another task while disabled");
    assert.equal(h.session.model?.id, "owner/fast");
    assert.equal(h.faux.state.callCount, 3);
    assert.deepEqual(h.errors, []);
  } finally {
    await h.close();
  }
});

test("role settings: large catalogs use the real searchable paginated picker for add, edit and default", async () => {
  const h = await sdkHarness();
  try {
    for (const provider of ["fixture-openai", "fixture-anthropic", "fixture-openrouter"]) {
      const faux = fauxProvider({
        provider,
        models: Array.from({ length: 40 }, (_, index) => ({
          id: `owner/catalog-${String(index).padStart(2, "0")}`,
          reasoning: true,
        })),
      });
      h.context.modelRegistry.registerProvider(faux.provider);
      await h.context.modelRegistry.refresh({ allowNetwork: false });
      assert.equal(
        h.context.modelRegistry.getAvailable().filter((model) => model.provider === provider)
          .length,
        40,
      );
    }
    const store = new ConfigStore(h.dir);
    h.ui.answers.push("catalog", "Use for small catalog lookups.", "low", true, true);
    h.ui.customAnswers.push(
      { type: "add" },
      { keys: ["\u001b[6~", "opnrt/ctlg39", "\r"] },
      { type: "close" },
    );
    await h.session.prompt("/model-roles settings");
    assert.deepEqual(h.errors, []);
    assert.deepEqual((await store.load())?.config.roles.catalog?.model, {
      provider: "fixture-openrouter",
      id: "owner/catalog-39",
    });
    h.ui.answers.push("Use for small catalog lookups.", "medium", true);
    h.ui.customAnswers.push(
      { type: "edit", id: "catalog" },
      { keys: ["anthr/ctlg38", "\r"] },
      { type: "close" },
    );
    await h.session.prompt("/model-roles settings");
    assert.deepEqual((await store.load())?.config.roles.catalog?.model, {
      provider: "fixture-anthropic",
      id: "owner/catalog-38",
    });
    h.ui.answers.push("high", true);
    h.ui.customAnswers.push(
      { type: "edit", id: "default" },
      { keys: ["openai/ctlg37", "\r"] },
      { type: "close" },
    );
    await h.session.prompt("/model-roles settings");
    assert.deepEqual((await store.load())?.config.roles.default.model, {
      provider: "fixture-openai",
      id: "owner/catalog-37",
    });
    h.ui.answers.push("inherit", true);
    h.ui.customAnswers.push(
      { type: "edit", id: "default" },
      { keys: ["inherit", "\r"] },
      { type: "close" },
    );
    await h.session.prompt("/model-roles settings");
    assert.deepEqual((await store.load())?.config.roles.default, {
      model: "inherit",
      effort: "inherit",
    });
    assert.ok(h.ui.customRenders.some((lines) => lines.some((line) => line.includes("Page 2/"))));
    assert.ok(
      h.ui.customRenders.every(
        (lines) => lines.filter((line) => line.includes("owner/catalog-")).length <= 8,
      ),
    );
    assert.equal(
      h.ui.selections.some((row) => row.title.includes("choose a model")),
      false,
    );
    assert.equal(h.session.model?.id, "default");
    assert.equal(h.session.thinkingLevel, "high");
    assert.equal(h.faux.state.callCount, 0);
    assert.deepEqual(h.errors, []);
  } finally {
    await h.close();
  }
});

test("native menu: invalid identifiers and descriptions never create drafts", async () => {
  const h = await sdkHarness();
  try {
    const store = new ConfigStore(h.dir);
    const before = await readFile(store.path, "utf8");
    for (const id of ["default", "constructor", "__proto__", "Bad name", "x".repeat(49)]) {
      h.ui.customAnswers.push({ type: "add" }, { type: "close" });
      h.ui.answers.push(id);
      await h.session.prompt("/model-roles");
    }
    h.ui.customAnswers.push({ type: "add" }, { type: "close" });
    h.ui.answers.push("fast", "  ");
    await h.session.prompt("/model-roles");
    assert.equal(await readFile(store.path, "utf8"), before);
  } finally {
    await h.close();
  }
});
