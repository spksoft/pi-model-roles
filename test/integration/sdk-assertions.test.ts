import assert, { AssertionError } from "node:assert/strict";
import { test } from "node:test";
import { sdkHarness } from "../support/sdk.js";

test("SDK harness surfaces assertion failures swallowed by a faux response callback", {
  timeout: 5000,
}, async () => {
  const h = await sdkHarness();
  try {
    h.respond(() => {
      assert.fail("Intentional synthetic provider assertion");
    });
    await h.session.prompt("Synthetic assertion fixture");
    assert.equal(h.session.messages.at(-1)?.role, "assistant");
    assert.deepEqual(h.errors, []); // Extension errors do not include provider failures.
  } finally {
    await assert.rejects(
      h.close(),
      (error) =>
        error instanceof AssertionError &&
        error.message === "Intentional synthetic provider assertion",
    );
  }
});
