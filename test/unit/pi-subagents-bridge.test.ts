import assert from "node:assert/strict";
import { test } from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  PI_SUBAGENT_ROUTING_UNSUPPORTED,
  createPiSubagentsBackgroundBridge,
  piSubagentRoutingDiagnostic,
} from "../../src/integrations/pi-subagents.js";
import childEntry from "../../src/integrations/pi-subagents-child.js";

test("automatic bridge fails closed without touching an absent or compatible owner", async () => {
  for (const compatible of [false, true]) {
    const events: string[] = [];
    const pi = {
      events: {
        on: () => {
          events.push("subscribe");
          return () => events.push("unsubscribe");
        },
        emit: (event: string, value: unknown) => {
          events.push(event);
          if (compatible && event === "pi-subagents:runtime-agent-register:v1")
            Object.assign(value as object, {
              result: { ok: true, registration: { dispose() {} } },
            });
        },
      },
    } as Pick<ExtensionAPI, "events">;
    const result = await createPiSubagentsBackgroundBridge(pi);
    assert.equal(result.status, "unsupported");
    assert.equal(result.code, PI_SUBAGENT_ROUTING_UNSUPPORTED);
    assert.match(result.message, /No child was registered or launched/);
    assert.match(result.message, /selectViaEvents/);
    assert.equal("spawn" in result, false);
    assert.deepEqual(events, []);
  }
});

test("diagnostic preserves caller pins and never includes their values", () => {
  const request = Object.freeze({
    model: Object.freeze({ provider: "fixture", id: "synthetic-pinned-model" }),
    effort: "low" as const,
  });
  assert.deepEqual(piSubagentRoutingDiagnostic(request), piSubagentRoutingDiagnostic());
  assert.equal(
    JSON.stringify(piSubagentRoutingDiagnostic(request)).includes(request.model.id),
    false,
  );
});

test("withdrawn child entry stays inert even with an apparently valid binding", () => {
  const previousChild = process.env.PI_SUBAGENT_CHILD;
  const previousBinding = process.env.PI_SUBAGENT_EXTENSION_BINDINGS;
  try {
    const routeId = "0123456789abcdef0123456789abcdef";
    for (const binding of [
      undefined,
      "malformed",
      JSON.stringify({
        "pi-model-roles/1": { version: 1, routeId, agent: `pi-model-roles-route-${routeId}` },
      }),
    ]) {
      process.env.PI_SUBAGENT_CHILD = "1";
      if (binding === undefined) delete process.env.PI_SUBAGENT_EXTENSION_BINDINGS;
      else process.env.PI_SUBAGENT_EXTENSION_BINDINGS = binding;
      const pi = new Proxy({} as ExtensionAPI, {
        get() {
          assert.fail("Inert child entry accessed Pi API");
        },
      });
      childEntry(pi);
    }
  } finally {
    if (previousChild === undefined) delete process.env.PI_SUBAGENT_CHILD;
    else process.env.PI_SUBAGENT_CHILD = previousChild;
    if (previousBinding === undefined) delete process.env.PI_SUBAGENT_EXTENSION_BINDINGS;
    else process.env.PI_SUBAGENT_EXTENSION_BINDINGS = previousBinding;
  }
});
