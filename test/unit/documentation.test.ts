import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { parseConfig } from "../../src/config/codec.js";
import { REASONS } from "../../src/core/types.js";

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
    "/model-roles auto-setup",
    "/model-roles auto-setup review",
    "/model-roles auto-setup cancel",
  ]) {
    assert.ok(readme.includes(command), `README missing ${command}`);
    assert.ok(configuration.includes(command), `configuration missing ${command}`);
  }
  assert.match(readme, /one to eight/i);
  assert.match(compatibility, /cannot make arbitrary normal-agent tools read-only/i);
});
