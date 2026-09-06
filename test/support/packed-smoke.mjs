// Runs as plain Node from a disposable production-only installation, without tsx.
import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { defaultConfig, selectModelForTask } from "pi-model-roles";
import extension from "./node_modules/pi-model-roles/dist/extension.js";
import { createEventBus } from "@earendil-works/pi-coding-agent";
const handlers = new Map();
const commands = new Map();
const model = { provider: "fixture", id: "default" };
const state = { model, effort: "off" };
const decision = await selectModelForTask(
  { task: "Synthetic packed task", current: state, baseline: state },
  {
    config: defaultConfig(),
    models: () => [{ ref: model, efforts: ["off"], images: false, contextWindow: 10000 }],
    classify: async () => {
      throw new Error("Unexpected classifier");
    },
  },
);
assert.equal(decision.status, "selected");
const pi = {
  events: createEventBus(),
  registerCommand: (name, command) => commands.set(name, command),
  on: (event, handler) => handlers.set(event, handler),
  appendEntry() {},
  setModel: async () => {
    throw new Error("Unexpected startup switch");
  },
  setThinkingLevel: () => {
    throw new Error("Unexpected startup effort change");
  },
};
extension(pi);
assert.ok(commands.has("model-roles"));
const ctx = {
  mode: "tui",
  cwd: process.cwd(),
  hasUI: true,
  model,
  thinkingLevel: "off",
  isProjectTrusted: () => false,
  sessionManager: { getSessionId: () => "packed", getBranch: () => [] },
  modelRegistry: { find: () => undefined },
  ui: { setStatus() {}, notify() {} },
};
await handlers.get("session_start")({ reason: "startup" }, ctx);
const path = resolve(process.env.PI_CODING_AGENT_DIR, "extensions/pi-model-roles/config.yaml");
const text = await readFile(path, "utf8");
assert.match(text, /model: inherit/);
await handlers.get("session_shutdown")({}, ctx);
// Disabling/removing executable package files must retain data outside the installation.
await rm(resolve("node_modules/pi-model-roles"), { recursive: true, force: true });
assert.equal(await readFile(path, "utf8"), text);
await assert.rejects(readFile(resolve(process.env.PI_CODING_AGENT_DIR, "settings.json")), {
  code: "ENOENT",
});
for (const name of ["tsx", "typescript", "pi-subagents"])
  await assert.rejects(import(name), { code: "ERR_MODULE_NOT_FOUND" });
process.stdout.write("packed API, extension activation and data retention passed\n");
