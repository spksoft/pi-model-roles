import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { ConfigStore } from "../../src/config/store.js";
import { config } from "../support/fixtures.js";
import { sdkHarness } from "../support/sdk.js";

test("automatic selection never adds tool history or expanded skill files to task data", {
  timeout: 5000,
}, async () => {
  const h = await sdkHarness({
    skills: true,
    tools: ["read"],
    prepare: async (dir) => {
      await mkdir(join(dir, "skills", "synthetic"), { recursive: true });
      await writeFile(
        join(dir, "skills", "synthetic", "SKILL.md"),
        "---\nname: synthetic\ndescription: Synthetic privacy fixture\n---\nSYNTHETIC_SKILL_BODY\n",
      );
      await writeFile(join(dir, "AGENTS.md"), "SYNTHETIC_CONTEXT_FILE_BODY\n");
    },
  });
  try {
    const store = new ConfigStore(h.dir);
    const snapshot = await store.load();
    assert.ok(snapshot);
    await store.save(config(), snapshot.revision);
    await h.session.reload();
    const selectors: string[] = [];
    let toolContext = "";
    let skillContext = "";
    h.respond(
      (context) => {
        selectors.push(JSON.stringify(context));
        return fauxAssistantMessage('{"matches":["fast"]}');
      },
      fauxAssistantMessage([fauxToolCall("read", { path: join(h.dir, "AGENTS.md") })], {
        stopReason: "toolUse",
      }),
      (context) => {
        toolContext = JSON.stringify(context.messages);
        return fauxAssistantMessage("SYNTHETIC_ASSISTANT_HISTORY");
      },
      (context) => {
        selectors.push(JSON.stringify(context));
        return fauxAssistantMessage('{"matches":["fast"]}');
      },
      (context) => {
        skillContext = JSON.stringify(context.messages);
        return fauxAssistantMessage("Skill completed.");
      },
      (context) => {
        selectors.push(JSON.stringify(context));
        return fauxAssistantMessage('{"matches":[]}');
      },
      fauxAssistantMessage("Final synthetic answer"),
    );
    await h.session.prompt("Inspect the synthetic context fixture");
    await h.session.prompt("/skill:synthetic");
    await h.session.prompt("Continue the synthetic task");
    assert.match(toolContext, /SYNTHETIC_CONTEXT_FILE_BODY/);
    assert.match(skillContext, /SYNTHETIC_SKILL_BODY/);
    assert.equal(selectors.length, 3);
    assert.equal(h.faux.state.callCount, 7);
    for (const data of selectors) {
      assert.doesNotMatch(
        data,
        /SYNTHETIC_CONTEXT_FILE_BODY|SYNTHETIC_SKILL_BODY|SYNTHETIC_ASSISTANT_HISTORY/,
      );
      assert.doesNotMatch(data, /Synthetic fixture\. No tools\./);
    }
    assert.match(selectors[1] ?? "", /\/skill:synthetic/);
    assert.match(selectors[2] ?? "", /Continue the synthetic task/);
    const metadata = JSON.stringify(
      h.session.sessionManager.getBranch().filter((entry) => entry.type === "custom"),
    );
    assert.doesNotMatch(
      metadata,
      /Continue the synthetic task|SYNTHETIC_CONTEXT_FILE_BODY|SYNTHETIC_SKILL_BODY/,
    );
    assert.ok(
      h.session.messages
        .filter((message) => message.role === "assistant")
        .every((message) => message.stopReason !== "error"),
    );
    assert.deepEqual(h.errors, []);
  } finally {
    await h.close();
  }
});
