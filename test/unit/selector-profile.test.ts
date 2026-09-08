import assert from "node:assert/strict";
import { test } from "node:test";
import { parseConfig, serializeConfig } from "../../src/config/codec.js";
import { freezeConfig, validateConfig } from "../../src/config/schema.js";
import { selectModelForTask } from "../../src/core/selection.js";
import { BASE, FAST, MODELS, config, dependencies, request } from "../support/fixtures.js";

test("selector profile validates, clones, freezes and round-trips exact slash identities", () => {
  const value = { ...config(), selector: { model: FAST, effort: "off" as const } };
  const parsed = parseConfig(serializeConfig(value));
  assert.deepEqual(parsed, value);
  assert.notEqual(parsed.selector?.model, FAST);
  freezeConfig(parsed);
  assert.ok(Object.isFrozen(parsed.selector));
  assert.ok(Object.isFrozen(parsed.selector?.model));
  for (const selector of [
    null,
    {},
    { model: "inherit" },
    { model: FAST, effort: "inherit" },
    { model: FAST, effort: "wat" },
    { model: FAST, extra: true },
  ])
    assert.throws(() => validateConfig({ ...config(), selector }));
  assert.equal(validateConfig(config()).selector, undefined);
});

test("absent profile preserves legacy classifier payload/options; explicit selector never mutates execution pair", async () => {
  for (const effort of [undefined, "off", "low"] as const) {
    const deps = dependencies();
    deps.config.selector = { model: FAST, ...(effort === undefined ? {} : { effort }) };
    const before = structuredClone(deps.config);
    const req = request();
    deps.classify = async (input) => {
      assert.deepEqual(input.model, FAST);
      assert.equal(input.effort, effort);
      assert.equal(Object.hasOwn(input, "effort"), effort !== undefined);
      assert.deepEqual(Object.keys(JSON.parse(input.text)).sort(), ["roles", "task"]);
      return { text: '{"matches":[]}' };
    };
    const result = await selectModelForTask(req, deps);
    assert.ok(result.status === "selected");
    assert.deepEqual(result.model, BASE);
    assert.equal(result.effort, "high");
    assert.equal(result.selector?.effort, effort);
    assert.deepEqual(deps.config, before);
    assert.deepEqual(req, request());
  }
  const deps = dependencies();
  deps.classify = async (input) => {
    assert.deepEqual(input.model, BASE);
    assert.equal(Object.hasOwn(input, "effort"), false);
    return { text: '{"matches":[]}' };
  };
  assert.equal((await selectModelForTask(request(), deps)).reason, "no_match");
});

test("explicit selector failure never retries another provider; scope, capabilities and precedence remain authoritative", async () => {
  let calls = 0;
  const deps = dependencies();
  deps.config.selector = { model: { provider: "missing", id: "owner/selector" } };
  deps.classify = async () => {
    calls++;
    throw new Error("PRIVATE_PROVIDER_ERROR");
  };
  assert.equal((await selectModelForTask(request(), deps)).reason, "selector_unavailable");
  deps.config.selector = { model: FAST, effort: "max" };
  assert.equal((await selectModelForTask(request(), deps)).reason, "selector_effort_unsupported");
  deps.config.selector.effort = "low";
  deps.supportsSelectorEffort = () => false;
  assert.equal((await selectModelForTask(request(), deps)).reason, "selector_effort_unsupported");
  delete deps.supportsSelectorEffort;
  deps.config.selector.model = BASE;
  const scoped = await selectModelForTask(
    request({ allowedModels: [FAST], current: { model: FAST, effort: "low" } }),
    deps,
  );
  assert.equal(scoped.reason, "selector_unavailable");
  assert.equal(
    (await selectModelForTask(request({ allowedModels: [] }), deps)).reason,
    "no_usable_model",
  );
  for (const [overrides, reason] of [
    [{ explicitModel: FAST }, "explicit"],
    [{ paused: true }, "manual"],
    [{ requestedRole: "fast" }, "requested_role"],
  ] as const)
    assert.equal((await selectModelForTask(request(overrides), deps)).reason, reason);
  assert.equal(calls, 0);
  deps.config.selector.model = FAST;
  const failed = await selectModelForTask(request(), deps);
  assert.equal(failed.reason, "selector_failed");
  assert.equal(calls, 1);
  assert.doesNotMatch(JSON.stringify(failed), /PRIVATE_PROVIDER_ERROR/);
});

test("selector ignores execution image need but final executor sees registry changes", async () => {
  const deps = dependencies();
  deps.config.selector = { model: FAST };
  let models = MODELS.map((model) => ({ ...model, images: model.ref.id === BASE.id }));
  deps.models = () => models;
  deps.config.roles.other = { model: BASE, effort: "low", description: "Image tasks" };
  deps.classify = async (input) => {
    assert.deepEqual(input.model, FAST);
    models = models.filter((model) => model.ref.id === BASE.id);
    return { text: '{"matches":["other"]}' };
  };
  const result = await selectModelForTask(request({ requiresImages: true }), deps);
  assert.equal(result.reason, "matched");
  assert.ok(result.status === "selected");
  assert.deepEqual(result.model, BASE);
});

test("explicit selector timeout and cancellation have no provider fallback", async () => {
  const deps = dependencies();
  deps.config.selector = { model: FAST };
  deps.config.selectorTimeoutMs = 1000;
  let calls = 0;
  let signal: AbortSignal | undefined;
  deps.classify = async (input) => {
    calls++;
    signal = input.signal;
    return new Promise(() => {});
  };
  const result = await selectModelForTask(request(), deps);
  assert.equal(result.reason, "selector_timeout");
  assert.equal(calls, 1);
  assert.ok(signal?.aborted);
  const abort = new AbortController();
  const pending = selectModelForTask(request({ signal: abort.signal }), deps);
  abort.abort();
  assert.equal((await pending).status, "cancelled");
  assert.equal(calls, 2);
});

test("scoped selector pin requires explicit matching proven effort, not a singleton capability", async () => {
  const deps = dependencies('{"matches":[]}');
  let calls = 0;
  deps.classify = async (input) => {
    calls++;
    assert.equal(input.effort, "high");
    return { text: '{"matches":[]}' };
  };
  deps.requiredSelectorEffort = () => "high";
  deps.supportsSelectorEffort = () => true;
  for (const selector of [undefined, { model: BASE }, { model: BASE, effort: "low" as const }]) {
    deps.config.selector = selector;
    const result = await selectModelForTask(request(), deps);
    assert.equal(result.reason, "selector_effort_unsupported");
    assert.ok(result.status === "selected");
    assert.deepEqual(result.model, BASE);
    assert.equal(result.effort, "high");
  }
  deps.config.selector = { model: BASE, effort: "high" };
  for (const supports of [undefined, () => false]) {
    deps.supportsSelectorEffort = supports;
    assert.equal((await selectModelForTask(request(), deps)).reason, "selector_effort_unsupported");
  }
  assert.equal(calls, 0);
  deps.supportsSelectorEffort = () => true;
  assert.equal((await selectModelForTask(request(), deps)).reason, "no_match");
  assert.equal(calls, 1);
  const pinned = await selectModelForTask(
    request({ explicitModel: FAST, explicitEffort: "low" }),
    deps,
  );
  assert.ok(pinned.status === "preserved");
  assert.deepEqual(pinned.model, FAST);
  assert.equal(pinned.effort, "low");
  assert.equal(calls, 1);
  delete deps.requiredSelectorEffort;
  delete deps.config.selector;
  deps.models = () => MODELS.map((model) => ({ ...model, efforts: ["high"] }));
  deps.classify = async (input) => {
    assert.equal(Object.hasOwn(input, "effort"), false);
    return { text: '{"matches":[]}' };
  };
  assert.equal((await selectModelForTask(request(), deps)).reason, "no_match");
});
