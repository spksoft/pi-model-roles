import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
const exec = promisify(execFile);

test("prebuilt tarball loads without devDependencies and keeps configuration on removal", {
  timeout: 120000,
}, async () => {
  const dir = await mkdtemp(join(tmpdir(), "roles packed "));
  try {
    const packed = await exec(
      "npm",
      ["pack", "--ignore-scripts", "--json", "--pack-destination", dir],
      { cwd: resolve("."), maxBuffer: 1024 * 1024 },
    );
    const [manifest] = JSON.parse(packed.stdout) as Array<{
      filename: string;
      files: Array<{ path: string }>;
    }>;
    assert.ok(manifest);
    const files = manifest.files.map((file) => file.path);
    assert.ok(files.includes("dist/index.js"));
    assert.ok(files.includes("dist/index.d.ts"));
    assert.ok(files.includes("dist/extension.js"));
    assert.ok(files.includes("src/extension.ts"));
    assert.equal(
      files.some(
        (file) =>
          /^(test|docs\/plan|node_modules)\//.test(file) || /config\.yaml|\.lock$/.test(file),
      ),
      false,
    );
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({
        private: true,
        type: "module",
        dependencies: {
          "pi-model-roles": `file:${join(dir, manifest.filename)}`,
          "@earendil-works/pi-ai": "0.85.1",
          "@earendil-works/pi-coding-agent": "0.85.1",
          "@earendil-works/pi-tui": "0.85.1",
        },
      }),
    );
    // Reuse exact locked host transitive versions: no registry metadata resolution in CI.
    await copyFile(resolve("package-lock.json"), join(dir, "package-lock.json"));
    await exec(
      "npm",
      ["install", "--offline", "--ignore-scripts", "--omit=dev", "--no-audit", "--no-fund"],
      { cwd: dir, maxBuffer: 1024 * 1024 },
    );
    const installed = JSON.parse(
      await readFile(join(dir, "node_modules/pi-model-roles/package.json"), "utf8"),
    ) as { scripts: Record<string, string>; pi: { extensions: string[] } };
    assert.equal(installed.scripts.install, undefined);
    assert.equal(installed.scripts.postinstall, undefined);
    assert.deepEqual(installed.pi.extensions, ["./src/extension.ts"]);
    await copyFile(resolve("test/support/packed-smoke.mjs"), join(dir, "smoke.mjs"));
    const result = await exec(process.execPath, ["smoke.mjs"], {
      cwd: dir,
      env: { ...process.env, PI_CODING_AGENT_DIR: join(dir, "agent data"), PI_SUBAGENT_CHILD: "" },
    });
    assert.match(result.stdout, /passed/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
