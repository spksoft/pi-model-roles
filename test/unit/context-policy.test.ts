import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CONTEXT_OVERRIDE_LIMIT,
  contextOverride,
  setContextOverride,
} from "../../src/pi/context-policy.js";

test("logical-session process overrides share same key, isolate identities and never evict at capacity", () => {
  assert.equal(setContextOverride("synthetic-agent", "session", "prompt"), true);
  const first = contextOverride("synthetic-agent", "session");
  assert.equal(first.policy, "prompt");
  assert.equal(contextOverride("other-agent", "session").policy, undefined);
  assert.equal(contextOverride("synthetic-agent", "new-session").policy, undefined);
  setContextOverride("synthetic-agent", "session", "conversation");
  setContextOverride("synthetic-agent", "session", "prompt");
  assert.ok(contextOverride("synthetic-agent", "session").revision > first.revision);
  for (let i = 1; i < CONTEXT_OVERRIDE_LIMIT; i++)
    assert.equal(setContextOverride("synthetic-agent", `session-${i}`, "prompt"), true);
  assert.equal(setContextOverride("synthetic-agent", "overflow", "conversation"), false);
  assert.equal(contextOverride("synthetic-agent", "session").policy, "prompt");
  assert.equal(setContextOverride("synthetic-agent", "session"), true);
  assert.equal(contextOverride("synthetic-agent", "session").policy, undefined);
  assert.equal(setContextOverride("synthetic-agent", "overflow", "prompt"), false);
});
