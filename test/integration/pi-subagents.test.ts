import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionFactory } from "@earendil-works/pi-coding-agent";
import example, { delegateExample } from "../../examples/pi-subagents.js";
import { ConfigStore } from "../../src/config/store.js";
import { config, FAST } from "../support/fixtures.js";
import { sdkHarness } from "../support/sdk.js";
test("pi-subagents 0.65.1: native public delegation receives selected model and explicit effort", {
  timeout: 35000,
}, async () => {
  let pi: ExtensionAPI | undefined;
  const tempRoot = await mkdtemp(join(tmpdir(), "roles-subagents-"));
  const previousRoot = process.env.PI_SUBAGENTS_TEMP_ROOT;
  process.env.PI_SUBAGENTS_TEMP_ROOT = tempRoot;
  // The optional package ships TS implementation rather than declaration files.
  // Test its runtime contract without type-checking its internal source tree.
  const packageName: string = "pi-subagents";
  const { default: subagents } = (await import(packageName)) as { default: ExtensionFactory };
  const h = await sdkHarness({
    extensions: [
      (api) => {
        // Test-only fixture provisioning using the public path-like tools contract.
        // Runtime-registered agents do not inherit defaultExtensions; foreground children have no ambient providers.
        api.events.on("pi-subagents:runtime-agent-register:v1", (value) => {
          const registration = value as { name: string; definition: { tools: string[] } };
          if (registration.name === "model-roles-native-example")
            registration.definition.tools = [resolve("test/support/subagent-provider.ts")];
        });
      },
      subagents,
      example,
      (api) => {
        pi = api;
      },
    ],
    prepare: async (_dir, faux) => {
      Reflect.set(globalThis, Symbol.for("pi-model-roles.test-provider"), faux.provider);
    },
  });
  try {
    assert.ok(pi);
    let launchError = "";
    h.bus.on("prompt-template:subagent:response", (value: unknown) => {
      if (value && typeof value === "object" && "error" in value) launchError = String(value.error);
    });
    const store = new ConfigStore(h.dir);
    const snap = await store.load();
    assert.ok(snap);
    await store.save(config(), snap.revision);
    await h.session.prompt("/model-roles reload");
    h.respond(fauxAssistantMessage('{"matches":["fast"]}'), (_context, options, _state, model) => {
      assert.equal(model.id, "owner/fast");
      assert.equal(options?.reasoning, "low");
      return fauxAssistantMessage("native child completed");
    });
    const result = await delegateExample(pi, h.context, "Synthetic bounded task");
    assert.equal(result.status, "completed", launchError);
    assert.equal(h.session.model?.id, "default");
    assert.equal(h.faux.state.callCount, 2);
    h.respond(fauxAssistantMessage("explicit child"));
    const pinned = await delegateExample(pi, h.context, "Pinned synthetic task", {
      model: FAST,
      effort: "low",
    });
    assert.equal(pinned.status, "completed");
    assert.equal(h.faux.state.callCount, 3);
    assert.deepEqual(h.errors, []);
  } finally {
    await h.close();
    Reflect.deleteProperty(globalThis, Symbol.for("pi-model-roles.test-provider"));
    if (previousRoot === undefined) delete process.env.PI_SUBAGENTS_TEMP_ROOT;
    else process.env.PI_SUBAGENTS_TEMP_ROOT = previousRoot;
    await rm(tempRoot, { recursive: true, force: true });
  }
});
