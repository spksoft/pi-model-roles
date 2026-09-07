import assert from "node:assert/strict";
import { test } from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { commandTarget, sameCommandTarget } from "../../src/pi/command-target.js";

type Command = ReturnType<ExtensionAPI["getCommands"]>[number];
const command: Command = {
  name: "execute-plan",
  source: "extension",
  sourceInfo: {
    path: "/synthetic/owner.ts",
    source: "fixture",
    scope: "temporary",
    origin: "top-level",
  },
};

test("command targets use exact invokable names and Pi's space-separated argument grammar", () => {
  const suffixed = { ...command, name: "execute-plan:2" };
  const commands = [command, suffixed];
  for (const text of ["/execute-plan", '/execute-plan  "two words"\nmore  '])
    assert.equal(commandTarget(text, commands), command);
  assert.equal(commandTarget("/execute-plan:2 file.html", commands), suffixed);
  for (const text of [
    "",
    "execute-plan",
    " /execute-plan",
    "/execute-plan\n",
    "/execute-plan\targs",
    "/missing",
    "/execute-plan:1",
  ])
    assert.equal(commandTarget(text, commands), undefined);
});

test("wrapper recursion is rejected even when model-roles and its numeric aliases are registered", () => {
  for (const name of ["model-roles", "model-roles:1", "model-roles:2"]) {
    const recursive = { ...command, name };
    assert.equal(commandTarget(`/${name} run /execute-plan`, [recursive]), undefined);
  }
});

test("target resolution keeps host source precedence and rejects changed public ownership", () => {
  const prompt: Command = { ...command, source: "prompt" };
  assert.equal(commandTarget("/execute-plan task", [command, prompt]), command);
  assert.equal(sameCommandTarget(command, structuredClone(command)), true);
  assert.equal(sameCommandTarget(command, undefined), false);
  assert.equal(sameCommandTarget(command, prompt), false);
  assert.equal(sameCommandTarget(command, { ...command, name: "execute-plan:1" }), false);
  for (const change of [
    { path: "/synthetic/replacement.ts" },
    { source: "other" },
    { scope: "project" as const },
    { origin: "package" as const },
    { baseDir: "/synthetic" },
  ])
    assert.equal(
      sameCommandTarget(command, { ...command, sourceInfo: { ...command.sourceInfo, ...change } }),
      false,
    );
});
