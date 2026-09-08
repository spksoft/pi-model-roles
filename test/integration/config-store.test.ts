import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, mkdir, symlink, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ConfigStore } from "../../src/config/store.js";
import { config } from "../support/fixtures.js";
test("atomic store initializes only absence, detects concurrent conflicts, retains invalid files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "roles store "));
  try {
    const a = new ConfigStore(dir);
    const b = new ConfigStore(dir);
    const initial = await a.load(true);
    assert.ok(initial);
    const outcomes = await Promise.allSettled([
      a.save(config(), initial.revision),
      b.save(config(), initial.revision),
    ]);
    assert.equal(outcomes.filter((result) => result.status === "fulfilled").length, 1);
    await writeFile(a.path, "version: 99\n");
    assert.ok(await a.load(true));
    assert.equal(a.error?.code, "unsupported_version");
    assert.equal(await readFile(a.path, "utf8"), "version: 99\n");
    const cold = new ConfigStore(dir);
    assert.equal(await cold.load(true), undefined);
    await cold.reset();
    assert.equal(Object.keys(cold.snapshot?.config.roles ?? {}).length, 1);
    if (process.platform !== "win32") assert.equal((await stat(a.path)).mode & 0o777, 0o600);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("enabled setter reads fresh state under lock and preserves unrelated role edits", async () => {
  const dir = await mkdtemp(join(tmpdir(), "roles-toggle-"));
  try {
    const a = new ConfigStore(dir);
    const b = new ConfigStore(dir);
    const initial = await a.load(true);
    assert.ok(initial);
    const updated = {
      ...config(),
      enabled: false,
      selectorContext: "conversation" as const,
      selectorTimeoutMs: 12000,
    };
    await b.save(updated, initial.revision);
    const toggled = await a.setEnabled(true);
    assert.deepEqual(toggled.config, { ...updated, enabled: true });
    await assert.rejects(b.save(config(), initial.revision), /conflict/);
    // Same-value requests must still consult disk, and an actual no-op preserves formatting.
    await writeFile(a.path, `# keep on no-op\n${await readFile(a.path, "utf8")}`);
    const before = await readFile(a.path, "utf8");
    assert.equal((await b.setEnabled(true)).config.enabled, true);
    assert.equal(await readFile(a.path, "utf8"), before);
    await Promise.all([a.setEnabled(false), a.setEnabled(true), a.setEnabled(false)]);
    assert.equal((await b.load())?.config.enabled, false);
    await writeFile(a.path, "version: 99\n");
    await assert.rejects(a.setEnabled(true), /unsupported_version/);
    assert.equal(await readFile(a.path, "utf8"), "version: 99\n");
    await rm(a.path);
    await assert.rejects(a.setEnabled(false), /config_missing/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("symlinks and abandoned locks fail safely", async () => {
  const dir = await mkdtemp(join(tmpdir(), "roles-lock-"));
  try {
    const store = new ConfigStore(dir, 30);
    await store.load(true);
    await mkdir(`${store.path}.lock`);
    await assert.rejects(store.save(config(), store.snapshot?.revision ?? null), /lock_busy/);
    await assert.rejects(store.setEnabled(false), /lock_busy/);
    await rm(`${store.path}.lock`, { recursive: true });
    await rm(store.path);
    const target = join(dir, "target");
    await writeFile(target, "unchanged");
    await symlink(target, store.path);
    await store.load(true);
    assert.equal(store.error?.code, "unsafe_config_file");
    assert.equal(await readFile(target, "utf8"), "unchanged");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
