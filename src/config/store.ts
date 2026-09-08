import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, rename, rmdir, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { LIMITS, defaultConfig } from "../core/defaults.js";
import type { RoleConfig } from "../core/types.js";
import { parseConfig, serializeConfig } from "./codec.js";
import { ConfigError, freezeConfig } from "./schema.js";
export interface ConfigSnapshot {
  config: RoleConfig;
  revision: string;
}
export function configPath(agentDir: string): string {
  return join(agentDir, "extensions", "pi-model-roles", "config.yaml");
}
function errorCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error ? String(error.code) : undefined;
}
function revision(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
export class ConfigStore {
  readonly path: string;
  snapshot?: ConfigSnapshot;
  error?: ConfigError;
  private tail: Promise<unknown> = Promise.resolve();
  constructor(
    agentDir: string,
    private readonly lockTimeoutMs = 2000,
  ) {
    this.path = configPath(agentDir);
  }
  private async raw(): Promise<string | undefined> {
    try {
      const stat = await lstat(this.path);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new ConfigError("unsafe_config_file");
      if (stat.size > LIMITS.yamlBytes) throw new ConfigError("file_too_large");
      const file = await open(this.path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      try {
        if (!(await file.stat()).isFile()) throw new ConfigError("unsafe_config_file");
        // Bounded read also protects a file that grows after stat().
        const buffer = Buffer.alloc(LIMITS.yamlBytes + 1);
        let length = 0;
        while (length < buffer.length) {
          const read = await file.read(buffer, length, buffer.length - length, null);
          if (!read.bytesRead) break;
          length += read.bytesRead;
        }
        if (length > LIMITS.yamlBytes) throw new ConfigError("file_too_large");
        return buffer.subarray(0, length).toString("utf8");
      } finally {
        await file.close();
      }
    } catch (error) {
      if (errorCode(error) === "ENOENT") return undefined;
      if (error instanceof ConfigError) throw error;
      throw new ConfigError(
        ["EACCES", "EPERM"].includes(errorCode(error) ?? "") ? "permission_denied" : "read_failed",
      );
    }
  }
  async load(initialize = false): Promise<ConfigSnapshot | undefined> {
    try {
      let text = await this.raw();
      if (text === undefined && initialize) {
        try {
          await this.save(defaultConfig(), null);
        } catch (error) {
          if (!(error instanceof ConfigError) || error.code !== "conflict") throw error;
        }
        text = await this.raw();
      }
      if (text === undefined) {
        this.error = undefined;
        this.snapshot = undefined;
        return undefined;
      }
      this.snapshot = Object.freeze({
        config: freezeConfig(parseConfig(text)),
        revision: revision(text),
      });
      this.error = undefined;
    } catch (error) {
      this.error = error instanceof ConfigError ? error : new ConfigError("load_failed");
    }
    return this.snapshot;
  }
  /** expected=null means create only. Invalid files require reset(), never an implicit overwrite. */
  save(config: RoleConfig, expected: string | null): Promise<ConfigSnapshot> {
    const text = serializeConfig(config);
    return this.enqueue((current) => {
      if ((current === undefined ? null : revision(current)) !== expected)
        throw new ConfigError("conflict");
      return text;
    });
  }
  /** Set only enabled against fresh disk state under the lock; never rebase role drafts. */
  setEnabled(enabled: boolean): Promise<ConfigSnapshot> {
    return this.enqueue((current) => {
      if (current === undefined) throw new ConfigError("config_missing");
      const config = parseConfig(current);
      return config.enabled === enabled ? current : serializeConfig({ ...config, enabled });
    });
  }
  private enqueue(update: (current: string | undefined) => string): Promise<ConfigSnapshot> {
    const work = this.tail.then(() => this.replace(update));
    this.tail = work.catch(() => undefined);
    return work;
  }
  async reset(): Promise<ConfigSnapshot> {
    // The command must obtain explicit destructive confirmation before calling this method.
    const text = await this.raw();
    return this.save(defaultConfig(), text === undefined ? null : revision(text));
  }
  private async replace(update: (current: string | undefined) => string): Promise<ConfigSnapshot> {
    const directory = dirname(this.path);
    const lock = `${this.path}.lock`;
    const temp = join(directory, `.config-${randomUUID()}.tmp`);
    let locked = false;
    try {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const until = Date.now() + this.lockTimeoutMs;
      while (!locked) {
        try {
          await mkdir(lock, { mode: 0o700 });
          locked = true;
        } catch (error) {
          if (errorCode(error) !== "EEXIST") throw error;
          if (Date.now() >= until) throw new ConfigError("lock_busy");
          await delay(25);
        }
      }
      const current = await this.raw();
      const text = update(current);
      // Parse before committing so a post-commit validation error cannot look like a failed write.
      const snapshot = Object.freeze({
        config: freezeConfig(parseConfig(text)),
        revision: revision(text),
      });
      if (current === text) {
        this.snapshot = snapshot;
        this.error = undefined;
        return snapshot;
      }
      const file = await open(temp, "wx", 0o600);
      try {
        await file.writeFile(text);
        await file.sync();
      } finally {
        await file.close();
      }
      await rename(temp, this.path);
      // Directory fsync is not supported on every platform. The replacement is already committed.
      try {
        const dir = await open(directory, "r");
        try {
          await dir.sync();
        } finally {
          await dir.close();
        }
      } catch {
        /* best effort */
      }
      this.snapshot = snapshot;
      this.error = undefined;
      return snapshot;
    } catch (error) {
      throw error instanceof ConfigError
        ? error
        : new ConfigError(
            ["EACCES", "EPERM"].includes(errorCode(error) ?? "")
              ? "permission_denied"
              : "save_failed",
          );
    } finally {
      await unlink(temp).catch(() => undefined);
      if (locked) await rmdir(lock).catch(() => undefined);
    }
  }
}
