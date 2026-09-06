import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { ConfigStore } from "../../src/config/store.js";
import { roleSummary } from "../../src/ui/menu.js";
import { sdkHarness } from "../support/sdk.js";

const draft = [
  "fast",
  "Use for short, well-specified tasks.\nคำอธิบาย",
  "2. fixture/owner/fast",
  "low",
  true,
  true,
] as const;
test("native menu: cancelling every add step leaves configuration and model untouched", async () => {
  const h = await sdkHarness();
  try {
    const store = new ConfigStore(h.dir);
    const before = await readFile(store.path, "utf8");
    for (let step = 0; step < draft.length; step++) {
      h.ui.answers.push("Add role", ...draft.slice(0, step), undefined, "Close");
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

test("native menu: create, edit, use, resume, delete, override default and reset", async () => {
  const h = await sdkHarness();
  try {
    const store = new ConfigStore(h.dir);
    h.ui.answers.push("Add role", ...draft, "Close");
    await h.session.prompt("/model-roles");
    let snap = await store.load();
    assert.ok(snap);
    assert.deepEqual(Object.keys(snap.config.roles), ["default", "fast"]);
    const fast = snap.config.roles.fast;
    assert.ok(fast);
    assert.equal(fast.effort, "low");
    h.ui.answers.push(
      roleSummary("fast", fast),
      "Edit",
      "Updated selection criteria",
      "2. fixture/owner/fast",
      "medium",
      true,
      "Close",
    );
    await h.session.prompt("/model-roles");
    snap = await store.load();
    assert.ok(snap);
    assert.equal(snap.config.roles.fast?.effort, "medium");
    await h.session.prompt("/model-roles use fast");
    assert.equal(h.session.model?.id, "owner/fast");
    assert.equal(h.session.thinkingLevel, "medium");
    assert.match(h.ui.statuses.get("model-roles") ?? "", /paused/);
    await h.session.prompt("/model-roles auto");
    assert.doesNotMatch(h.ui.statuses.get("model-roles") ?? "", /paused/);
    const changed = snap.config.roles.fast;
    assert.ok(changed);
    h.ui.answers.push(roleSummary("fast", changed), "Delete", true, "Close");
    await h.session.prompt("/model-roles");
    snap = await store.load();
    assert.ok(snap);
    assert.deepEqual(Object.keys(snap.config.roles), ["default"]);
    h.ui.answers.push(
      roleSummary("default", snap.config.roles.default),
      "Edit",
      "2. fixture/owner/fast",
      "high",
      true,
      "Close",
    );
    await h.session.prompt("/model-roles");
    snap = await store.load();
    assert.ok(snap);
    assert.equal(snap.config.roles.default.effort, "high");
    h.ui.answers.push(
      roleSummary("default", snap.config.roles.default),
      "Back",
      "Reset configuration",
      true,
      "Close",
    );
    await h.session.prompt("/model-roles");
    assert.ok(
      h.ui.selections
        .filter((row) => row.title === "Role: default")
        .every((row) => !row.options.includes("Delete")),
    );
    snap = await store.load();
    assert.ok(snap);
    assert.deepEqual(snap.config.roles.default, { model: "inherit", effort: "inherit" });
    await assert.rejects(readFile(`${h.dir}/settings.json`), { code: "ENOENT" });
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
      h.ui.answers.push("Add role", id, "Close");
      await h.session.prompt("/model-roles");
    }
    h.ui.answers.push("Add role", "fast", "  ", "Close");
    await h.session.prompt("/model-roles");
    assert.equal(await readFile(store.path, "utf8"), before);
  } finally {
    await h.close();
  }
});
