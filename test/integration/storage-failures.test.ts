import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import { chmod, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { mock, test } from "node:test";
import { promisify } from "node:util";
import { ConfigStore } from "../../src/config/store.js";
import { parseConfig, serializeConfig } from "../../src/config/codec.js";
import { config } from "../support/fixtures.js";

test("two independent processes cannot overwrite a stale revision", async () => {
  const dir = await mkdtemp(join(tmpdir(), "roles processes "));
  try {
    const store = new ConfigStore(dir);
    const snap = await store.load(true);
    assert.ok(snap);
    const run = () =>
      promisify(execFile)(process.execPath, [
        "--import",
        "tsx",
        resolve("test/support/store-writer.ts"),
        dir,
        snap.revision,
      ]);
    const results = await Promise.all([run(), run()]);
    assert.deepEqual(results.map((result) => result.stdout).sort(), ["conflict", "saved"]);
    assert.deepEqual(parseConfig(await readFile(store.path, "utf8")), config());
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

for (const phase of ["before-write", "before-rename", "after-rename"] as const)
  test(`atomic replacement interruption ${phase} leaves old-valid or new-valid YAML`, async () => {
    const dir = await mkdtemp(join(tmpdir(), "roles fault "));
    try {
      const store = new ConfigStore(dir);
      const snap = await store.load(true);
      assert.ok(snap);
      const old = await readFile(store.path, "utf8");
      const next = serializeConfig(config());
      const originalOpen = fs.promises.open;
      const originalRename = fs.promises.rename;
      if (phase === "before-write")
        mock.method(fs.promises, "open", async (...args: Parameters<typeof originalOpen>) => {
          if (String(args[0]).endsWith(".tmp")) throw new Error("Injected write failure");
          return originalOpen(...args);
        });
      else
        mock.method(fs.promises, "rename", async (...args: Parameters<typeof originalRename>) => {
          if (phase === "after-rename") await originalRename(...args);
          throw new Error("Injected rename failure");
        });
      syncBuiltinESMExports();
      await assert.rejects(store.save(config(), snap.revision), /save_failed/);
      mock.restoreAll();
      syncBuiltinESMExports();
      const actual = await readFile(store.path, "utf8");
      assert.equal(actual, phase === "after-rename" ? next : old);
      parseConfig(actual);
      assert.deepEqual(await readdir(dirname(store.path)), ["config.yaml"]);
    } finally {
      mock.restoreAll();
      syncBuiltinESMExports();
      await rm(dir, { recursive: true, force: true });
    }
  });

test("unwritable storage is a bounded error", {
  skip: process.platform === "win32" || process.getuid?.() === 0,
}, async () => {
  const dir = await mkdtemp(join(tmpdir(), "roles readonly "));
  const store = new ConfigStore(dir);
  try {
    const snap = await store.load(true);
    assert.ok(snap);
    await chmod(dirname(store.path), 0o500);
    await assert.rejects(store.save(config(), snap.revision), /permission_denied/);
    await assert.rejects(store.setEnabled(false), /permission_denied/);
    assert.deepEqual(parseConfig(await readFile(store.path, "utf8")), snap.config);
  } finally {
    await chmod(dirname(store.path), 0o700);
    await rm(dir, { recursive: true, force: true });
  }
});
