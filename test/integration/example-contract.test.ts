import assert from "node:assert/strict";
import { test } from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import example, { delegateExample } from "../../examples/pi-subagents.js";
import { sdkHarness } from "../support/sdk.js";

test("opt-in example with no compatible owner reports unsupported and does not launch", async () => {
  const h = await sdkHarness({ extensions: [example] });
  try {
    await h.session.prompt("/model-roles-delegate-example Synthetic task");
    assert.ok(h.ui.notifications.some((text) => text.includes("compatible pi-subagents owner")));
    assert.equal(h.faux.state.callCount, 0);
  } finally {
    await h.close();
  }
});

test("launcher denial is authoritative and caller cancellation uses only the owner's cancel event", async () => {
  let pi: ExtensionAPI | undefined;
  const h = await sdkHarness({
    extensions: [
      (api) => {
        pi = api;
      },
    ],
  });
  try {
    assert.ok(pi);
    let launches = 0;
    let cancels = 0;
    const signal = new AbortController();
    const off = h.bus.on("prompt-template:subagent:request", (value: unknown) => {
      launches++;
      const identity = value as { requestId: string; ownerRunId: string; nodeId: string };
      if (launches === 1)
        h.bus.emit("prompt-template:subagent:response", {
          requestId: identity.requestId,
          ownerRunId: identity.ownerRunId,
          nodeId: identity.nodeId,
          status: "blocked",
        });
      else signal.abort();
    });
    const offCancel = h.bus.on("prompt-template:subagent:cancel", () => {
      cancels++;
    });
    assert.equal((await delegateExample(pi, h.context, "Synthetic denied task")).status, "blocked");
    assert.equal(
      (await delegateExample(pi, h.context, "Synthetic cancelled task", undefined, signal.signal))
        .status,
      "cancelled",
    );
    assert.equal(launches, 2);
    assert.equal(cancels, 1);
    assert.equal(h.faux.state.callCount, 0);
    assert.equal(h.session.model?.id, "default");
    off();
    offCancel();
  } finally {
    await h.close();
  }
});
