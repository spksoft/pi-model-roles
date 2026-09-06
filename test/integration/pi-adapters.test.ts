import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent";
import { availableModels, readDefaults } from "../../src/pi/adapters.js";
import { BASE, FAST } from "../support/fixtures.js";
import { sdkHarness } from "../support/sdk.js";

test("read-only defaults: trust, per-model effort, invalid defaults and baseline stability", async () => {
  const h = await sdkHarness();
  try {
    const baseline = { model: BASE, effort: "high" as const };
    const global = JSON.stringify({
      defaultProvider: "fixture",
      defaultModel: "default",
      defaultThinkingLevel: "medium",
      modelThinkingLevels: { "fixture/default": "low" },
    });
    const project = JSON.stringify({
      defaultProvider: "fixture",
      defaultModel: "owner/fast",
      defaultThinkingLevel: "high",
    });
    await writeFile(join(h.dir, "settings.json"), global);
    await mkdir(join(h.dir, CONFIG_DIR_NAME), { recursive: true });
    await writeFile(join(h.dir, CONFIG_DIR_NAME, "settings.json"), project);
    const untrusted = readDefaults(
      { ...h.context, isProjectTrusted: () => false },
      h.dir,
      baseline,
    );
    assert.deepEqual(untrusted.baseline, { model: BASE, effort: "low" });
    const trusted = readDefaults({ ...h.context, isProjectTrusted: () => true }, h.dir, baseline);
    assert.deepEqual(trusted.baseline, { model: FAST, effort: "high" });
    const fast = h.faux.models[1];
    assert.ok(fast);
    await h.session.setModel(fast);
    assert.deepEqual(readDefaults(h.context, h.dir, baseline).baseline, untrusted.baseline);
    assert.equal(await readFile(join(h.dir, "settings.json"), "utf8"), global);
    assert.equal(await readFile(join(h.dir, CONFIG_DIR_NAME, "settings.json"), "utf8"), project);
    await writeFile(
      join(h.dir, "settings.json"),
      JSON.stringify({ defaultProvider: "missing", defaultModel: "missing" }),
    );
    assert.deepEqual(readDefaults(h.context, h.dir, baseline).baseline, baseline);
    assert.equal(h.faux.state.callCount, 0);
    const all = availableModels(h.context);
    assert.equal(all.length, 2);
    const onlyFast = availableModels({ ...h.context, scopedModels: [{ model: fast }] });
    assert.deepEqual(
      onlyFast.map((item) => item.ref),
      [FAST],
    );
  } finally {
    await h.close();
  }
});
