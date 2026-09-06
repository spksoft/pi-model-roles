import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultConfig } from "../../src/core/defaults.js";
import { bounded, DeadlineError } from "../../src/core/async.js";
import { parseMatches } from "../../src/core/classifier-protocol.js";
import { selectModelForTask } from "../../src/core/selection.js";
import { BASE, FAST, MODELS, config, dependencies, request } from "../support/fixtures.js";
test("default-only, disabled, manual, explicit and requested-role paths never classify", async () => {
  const deps = dependencies();
  deps.classify = async () => {
    throw new Error("must not classify");
  };
  for (const input of [
    request({ paused: true }),
    request({ explicitModel: FAST }),
    request({ explicitEffort: "low" }),
    request({ requestedRole: "fast" }),
  ]) {
    const decision = await selectModelForTask(input, deps);
    assert.ok(decision.status === "selected" || decision.status === "preserved");
    assert.equal(decision.selector, undefined);
  }
  deps.config = defaultConfig();
  assert.equal((await selectModelForTask(request(), deps)).reason, "default_only");
  deps.config = { ...config(), enabled: false };
  assert.equal((await selectModelForTask(request(), deps)).reason, "disabled");
});
for (const [text, reason, role] of [
  ['{"matches":["fast"]}', "matched", "fast"],
  ['{"matches":[]}', "no_match", "default"],
  ['{"matches":["other"]}', "invalid_response", "default"],
  ['{"matches":["fast","fast"]}', "invalid_response", "default"],
  ['{"matches":[],"secret":"marker"}', "invalid_response", "default"],
  ["```json\n{}\n```", "invalid_response", "default"],
] as const)
  test(`classifier result ${reason}/${text.length}`, async () => {
    const result = await selectModelForTask(request(), dependencies(text));
    assert.equal(result.reason, reason);
    assert.equal(result.status, "selected");
    if (result.status === "selected") assert.equal(result.role, role);
  });
test("ambiguity is deterministic regardless of role ordering", async () => {
  const deps = dependencies('{"matches":["slow","fast"]}');
  deps.config.roles.slow = { model: BASE, effort: "high", description: "Also mechanical" };
  assert.equal((await selectModelForTask(request(), deps)).reason, "ambiguous");
  deps.config.roles = { slow: deps.config.roles.slow, ...config().roles };
  assert.equal((await selectModelForTask(request(), deps)).reason, "ambiguous");
});
test("exact restrictions and invalid explicit pins never silently substitute", async () => {
  const deps = dependencies();
  assert.equal(
    (
      await selectModelForTask(
        request({ explicitModel: { provider: "missing", id: "model" } }),
        deps,
      )
    ).reason,
    "invalid_explicit",
  );
  assert.equal(
    (await selectModelForTask(request({ explicitEffort: "max" }), deps)).reason,
    "invalid_explicit",
  );
  assert.equal(
    (await selectModelForTask(request({ allowedModels: [] }), deps)).status,
    "unavailable",
  );
  const result = await selectModelForTask(request({ allowedModels: [BASE] }), deps);
  assert.equal(result.reason, "default_only");
  assert.deepEqual(result.warnings, ["roles_unavailable"]);
});
test("fallback is finite, revalidated, capability-aware and independent of current routed model", async () => {
  const deps = dependencies();
  let calls = 0;
  let models = MODELS;
  deps.models = () => models;
  deps.classify = async (input) => {
    calls++;
    assert.deepEqual(input.model, BASE);
    models = MODELS.filter((model) => model.ref.id === BASE.id);
    return { text: '{"matches":["fast"]}' };
  };
  const result = await selectModelForTask(
    request({ current: { model: FAST, effort: "low" } }),
    deps,
  );
  assert.equal(result.reason, "role_unavailable");
  assert.equal(calls, 1);
  deps.config.roles.default.model = { provider: "missing", id: "gone" };
  assert.equal((await selectModelForTask(request(), deps)).fallback, true);
  deps.models = () => MODELS.map((model) => ({ ...model, images: false }));
  assert.equal(
    (await selectModelForTask(request({ requiresImages: true }), deps)).status,
    "unavailable",
  );
});
test("large, insufficient and context-limited tasks bypass rather than truncate", async () => {
  assert.equal(
    (await selectModelForTask(request({ task: "x".repeat(16385) }), dependencies())).reason,
    "input_too_large",
  );
  assert.equal(
    (await selectModelForTask(request({ task: "  " }), dependencies())).reason,
    "insufficient_text",
  );
  const deps = dependencies();
  deps.models = () => MODELS.map((model) => ({ ...model, contextWindow: 100 }));
  assert.equal((await selectModelForTask(request(), deps)).reason, "context_budget");
});
test("timeouts and cancellation settle non-cooperative work and isolate requests", async () => {
  await assert.rejects(
    bounded(() => new Promise(() => {}), 5),
    DeadlineError,
  );
  const controller = new AbortController();
  const deps = dependencies();
  deps.classify = () => new Promise(() => {});
  const pending = selectModelForTask(request({ signal: controller.signal }), deps);
  controller.abort();
  assert.equal((await pending).status, "cancelled");
  assert.equal((await selectModelForTask(request(), dependencies())).reason, "matched");
  deps.config.selectorTimeoutMs = 1000;
  assert.equal((await selectModelForTask(request(), deps)).reason, "selector_timeout");
});
test("decisions do not contain task text, criteria, or raw provider errors", async () => {
  const deps = dependencies();
  deps.classify = async () => {
    throw new Error("PRIVATE_SENTINEL");
  };
  const result = await selectModelForTask(request({ task: "PRIVATE_SENTINEL" }), deps);
  assert.equal(JSON.stringify(result).includes("PRIVATE_SENTINEL"), false);
  assert.equal(JSON.stringify(result).includes("Clear, mechanical"), false);
  assert.equal(parseMatches("x".repeat(16385), ["fast"]), undefined);
});
