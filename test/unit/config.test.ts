import assert from "node:assert/strict";
import { test } from "node:test";
import { parseConfig, serializeConfig } from "../../src/config/codec.js";
import { validateConfig } from "../../src/config/schema.js";
import { defaultConfig } from "../../src/core/defaults.js";
import { config } from "../support/fixtures.js";
test("YAML round-trips default and multiline Unicode criteria", () => {
  const value = config();
  value.roles.fast = {
    model: { provider: "fixture", id: "owner/fast" },
    effort: "low",
    description: "งานชัดเจน\nclear tasks",
  };
  assert.deepEqual(parseConfig(serializeConfig(value)), value);
  assert.deepEqual(parseConfig(serializeConfig(defaultConfig())), defaultConfig());
});
test("selector context is opt-in, round-trips both modes, and rejects invalid values", () => {
  assert.equal(defaultConfig().selectorContext, undefined);
  assert.doesNotMatch(serializeConfig(defaultConfig()), /selectorContext/);
  for (const selectorContext of ["prompt", "conversation"] as const) {
    const value = { ...config(), selectorContext };
    assert.deepEqual(parseConfig(serializeConfig(value)), value);
  }
  for (const selectorContext of [true, false, null, "full", "", {}]) {
    assert.throws(
      () => validateConfig({ ...config(), selectorContext }),
      /invalid_selector_context: selectorContext/,
    );
  }
});
for (const yaml of [
  "version: 2",
  "version: 1\nroles: {}",
  "version: 1\nversion: 1",
  "value: !execute secret-marker",
  "a: &a [1]\nb: *a",
  "version: 1\nroles:\n  default: {model: inherit, effort: unknown}",
  "version: 1\nroles:\n  default: {model: inherit, effort: inherit}\n  fast: {model: inherit, effort: low, description: work}",
])
  test(`invalid YAML case ${yaml.length}/${yaml.slice(0, 10)}`, () => {
    assert.throws(() => parseConfig(yaml));
  });
test("unknown fields and limits fail without echoing data", () => {
  assert.throws(
    () => parseConfig("secret-marker: secret-marker"),
    (error: Error) => !error.message.includes("secret-marker"),
  );
  assert.throws(() => parseConfig("#".repeat(262145)));
  assert.throws(() => validateConfig({ ...config(), extra: true }));
  assert.throws(() =>
    validateConfig({ ...config(), roles: { ...config().roles, constructor: {} } }),
  );
  assert.throws(() =>
    validateConfig({
      ...config(),
      roles: {
        ...config().roles,
        fast: { description: " ", model: { provider: "a", id: "b" }, effort: "low" },
      },
    }),
  );
});
