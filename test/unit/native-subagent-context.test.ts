import assert from "node:assert/strict";
import { test } from "node:test";
import { assertNativeSubagentParentContext } from "../support/native-subagent-context.js";

test("native subagent context rejects child import without changing policy flags", () => {
  const environment = Object.freeze({
    PI_SUBAGENT_CHILD: "1",
    PI_SUBAGENT_DEPTH: "2",
    PI_SUBAGENT_MAX_DEPTH: "2",
  });
  assert.throws(
    () => assertNativeSubagentParentContext(environment),
    (error: unknown) => {
      assert.ok(error instanceof assert.AssertionError);
      assert.match(error.message, /requires a normal parent process/);
      assert.match(error.message, /without changing inherited safety flags/);
      return true;
    },
  );
  assert.deepEqual(environment, {
    PI_SUBAGENT_CHILD: "1",
    PI_SUBAGENT_DEPTH: "2",
    PI_SUBAGENT_MAX_DEPTH: "2",
  });
});

test("native subagent context precondition permits parent without claiming launch authority", () => {
  assert.doesNotThrow(() => assertNativeSubagentParentContext(Object.freeze({})));
  // Depth is not the import-time owner gate. The native launcher still enforces its policies.
  const environment = Object.freeze({ PI_SUBAGENT_DEPTH: "2", PI_SUBAGENT_MAX_DEPTH: "2" });
  assert.doesNotThrow(() => assertNativeSubagentParentContext(environment));
  assert.deepEqual(environment, { PI_SUBAGENT_DEPTH: "2", PI_SUBAGENT_MAX_DEPTH: "2" });
});
