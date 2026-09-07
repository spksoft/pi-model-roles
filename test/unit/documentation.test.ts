import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { parseConfig } from "../../src/config/codec.js";
import { REASONS } from "../../src/core/types.js";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { defaultConfig } from "../../src/core/defaults.js";
import { confirmFirstCustomRoleRouting } from "../../src/ui/config-save.js";
import { config } from "../support/fixtures.js";

test("published configuration examples parse and API documents every reason", async () => {
  for (const path of ["README.md", "docs/configuration.md"]) {
    const text = await readFile(path, "utf8");
    const examples = [...text.matchAll(/```yaml\n([\s\S]*?)```/g)];
    assert.ok(examples.length > 0);
    for (const example of examples) {
      assert.ok(example[1]);
      assert.equal(parseConfig(example[1]).version, 1);
    }
  }
  const api = await readFile("docs/api.md", "utf8");
  for (const reason of REASONS)
    assert.ok(api.includes(`\`${reason}\``), `Undocumented reason ${reason}`);
  const readme = await readFile("README.md", "utf8");
  const configuration = await readFile("docs/configuration.md", "utf8");
  const compatibility = await readFile("docs/compatibility.md", "utf8");
  for (const command of [
    "/model-roles settings",
    "/model-roles enable",
    "/model-roles disable",
    "/model-roles use <role>",
  ]) {
    assert.ok(readme.includes(command), `README missing ${command}`);
    assert.ok(configuration.includes(command), `configuration missing ${command}`);
  }
  for (const removed of [
    "/model-roles status",
    "/model-roles reload",
    "/model-roles pause",
    "/model-roles auto-setup",
  ]) {
    assert.ok(!readme.includes(removed), `README still documents removed command ${removed}`);
    assert.ok(
      !configuration.includes(removed),
      `configuration still documents removed command ${removed}`,
    );
  }
  assert.match(readme, /opens the review automatically/i);
  assert.match(readme, /one to eight/i);
  assert.match(compatibility, /cannot make arbitrary normal-agent tools read-only/i);
  assert.match(compatibility, /Per-turn routing is not supported/);
  assert.match(api, /automatic_child_routing_unsupported/);
  assert.doesNotMatch(api, /await bridge\.spawn/);
});

test("first-role consent describes the supported task-only routing and preserves rejection", async () => {
  let disclosure = "";
  const ctx = {
    ui: {
      confirm: async (_title: string, message: string) => {
        disclosure = message;
        return false;
      },
    },
  } as unknown as ExtensionContext;
  assert.equal(await confirmFirstCustomRoleRouting(ctx, defaultConfig(), config()), false);
  assert.match(disclosure, /idle TUI submission/);
  assert.match(disclosure, /submitted task text and role descriptions/);
  assert.match(disclosure, /not automatically collected/);
  assert.match(disclosure, /not secret-filtered/);
  assert.match(disclosure, /Auto Setup are not independently rerouted/);
});
