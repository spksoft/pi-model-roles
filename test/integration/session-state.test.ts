import assert from "node:assert/strict";
import { test } from "node:test";
import { STATE_ENTRY, restoreState } from "../../src/pi/session-state.js";
import { BASE, FAST } from "../support/fixtures.js";
import { sdkHarness } from "../support/sdk.js";

test("branch state restores auto/manual conservatively and rejects future versions", async () => {
  const h = await sdkHarness();
  try {
    const current = { model: BASE, effort: "high" as const };
    const baseline = { model: BASE, effort: "off" as const };
    h.session.sessionManager.appendCustomEntry(STATE_ENTRY, {
      version: 1,
      mode: "auto",
      baseline,
      actual: current,
      role: "default",
    });
    assert.equal(restoreState(h.context, current, current)?.mode, "auto");
    assert.equal(restoreState(h.context, { model: FAST, effort: "low" }, current)?.mode, "manual");
    assert.equal(
      restoreState(h.context, { model: BASE, effort: "medium" }, current)?.mode,
      "manual",
    );
    h.session.sessionManager.appendCustomEntry(STATE_ENTRY, { version: 999, mode: "auto" });
    const future = restoreState(h.context, current, current);
    assert.equal(future?.mode, "manual");
    assert.deepEqual(future?.baseline, current);
  } finally {
    await h.close();
  }
});

test("explicit startup choice outranks restored auto, while explicit resume survives extension reload", async () => {
  const previousArgv = process.argv;
  process.argv = [...previousArgv, "--model", "fixture/default"];
  const h = await sdkHarness();
  try {
    assert.match(h.ui.statuses.get("model-roles") ?? "", /auto-selector=disabled/);
    await h.session.prompt("/model-roles enable");
    assert.match(h.ui.statuses.get("model-roles") ?? "", /auto-selector=enabled/);
    await h.session.reload();
    assert.match(h.ui.statuses.get("model-roles") ?? "", /auto-selector=enabled/);
    await h.session.extensionRunner.emit({ type: "session_start", reason: "resume" });
    assert.match(h.ui.statuses.get("model-roles") ?? "", /auto-selector=disabled/);
    assert.equal(h.faux.state.callCount, 0);
  } finally {
    await h.close();
    process.argv = previousArgv;
  }
});
