import { ConfigStore } from "../../src/config/store.js";
import { config } from "./fixtures.js";
const [, , dir, revision] = process.argv;
if (!dir || !revision) throw new Error("Fixture arguments missing");
try {
  await new ConfigStore(dir).save(config(), revision);
  process.stdout.write("saved");
} catch (error) {
  process.stdout.write(
    error instanceof Error && error.message.startsWith("conflict:") ? "conflict" : "failed",
  );
}
