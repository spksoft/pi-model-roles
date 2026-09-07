import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fauxAssistantMessage, type FauxResponseFactory } from "@earendil-works/pi-ai";
import { ConfigStore } from "../../src/config/store.js";
import { config } from "../support/fixtures.js";
import { sdkHarness } from "../support/sdk.js";

async function commandHarness(options: Parameters<typeof sdkHarness>[0] = {}) {
  return sdkHarness({
    ...options,
    prompts: true,
    skills: true,
    prepare: async (dir) => {
      await mkdir(join(dir, "prompts"), { recursive: true });
      await writeFile(
        join(dir, "prompts", "plan.md"),
        "---\ndescription: SYNTHETIC_TEMPLATE_DESCRIPTION\n---\nSYNTHETIC_TEMPLATE_BODY\nPlan the following task: $ARGUMENTS\n",
      );
      await mkdir(join(dir, "skills", "synthetic"), { recursive: true });
      await writeFile(
        join(dir, "skills", "synthetic", "SKILL.md"),
        "---\nname: synthetic\ndescription: SYNTHETIC_SKILL_DESCRIPTION\n---\nSYNTHETIC_SKILL_BODY\n",
      );
      const store = new ConfigStore(dir);
      const snapshot = await store.load(true);
      assert.ok(snapshot);
      await store.save(config(), snapshot.revision);
    },
  });
}

for (const text of [
  '/plan Design a synthetic feature "with two steps"\nInclude tests',
  "/plan\tDesign a synthetic feature",
  "/plan",
  "/skill:synthetic Inspect a synthetic feature",
  "/skill:synthetic",
])
  test(`registered prompt routes once before expansion: ${JSON.stringify(text)}`, async () => {
    const h = await commandHarness();
    try {
      const calls: Array<{ model: string; effort: string | undefined }> = [];
      let selector = "";
      let selectedTask: unknown;
      let execution = "";
      h.respond(
        (context, options, _state, model) => {
          selector = JSON.stringify(context);
          const message = context.messages[0];
          assert.ok(message?.role === "user" && Array.isArray(message.content));
          const block = message.content[0];
          assert.ok(block?.type === "text");
          selectedTask = JSON.parse(block.text).task;
          calls.push({ model: model.id, effort: options?.reasoning });
          return fauxAssistantMessage('{"matches":["fast"]}');
        },
        (context, options, _state, model) => {
          execution = JSON.stringify(context.messages);
          calls.push({ model: model.id, effort: options?.reasoning });
          return fauxAssistantMessage("Synthetic command completed");
        },
      );
      await h.session.prompt(text, {
        images: [{ type: "image", data: "SYNTHETIC_IMAGE", mimeType: "image/png" }],
      });
      assert.deepEqual(calls, [
        { model: "default", effort: undefined },
        { model: "owner/fast", effort: "low" },
      ]);
      assert.equal(selectedTask, text);
      assert.doesNotMatch(selector, /SYNTHETIC_(IMAGE|(?:TEMPLATE|SKILL)_(?:BODY|DESCRIPTION))/);
      assert.match(execution, /SYNTHETIC_IMAGE/);
      assert.match(
        execution,
        text.startsWith("/plan") ? /SYNTHETIC_TEMPLATE_BODY/ : /SYNTHETIC_SKILL_BODY/,
      );
      const metadata = JSON.stringify(
        h.session.sessionManager.getBranch().filter((entry) => entry.type === "custom"),
      );
      assert.doesNotMatch(metadata, /\/plan|\/skill:synthetic|SYNTHETIC_(TEMPLATE|SKILL)/);
      assert.deepEqual(h.errors, []);
    } finally {
      await h.close();
    }
  });

test("unknown commands, extension-owned commands and generated input remain unrouted", async () => {
  let handled = 0;
  const h = await commandHarness({
    extensions: [
      (pi) => {
        // A real command takes precedence over a prompt template with the same name.
        pi.registerCommand("plan", {
          description: "Synthetic command owner",
          handler: async () => {
            handled++;
          },
        });
      },
    ],
  });
  try {
    await h.session.prompt("/plan Synthetic command arguments");
    assert.equal(handled, 1);
    assert.equal(h.faux.state.callCount, 0);
    const calls: string[] = [];
    const response: FauxResponseFactory = (_context, _options, _state, model) => {
      calls.push(model.id);
      return fauxAssistantMessage("Unrouted synthetic answer");
    };
    h.respond(response, response, response);
    await h.session.prompt("/unknown Synthetic task");
    await h.session.prompt("/skill:missing Synthetic task");
    await h.session.sendUserMessage("/skill:synthetic Generated task", {
      expandPromptTemplates: true,
    });
    assert.deepEqual(calls, ["default", "default", "default"]);
    assert.deepEqual(h.errors, []);
  } finally {
    await h.close();
  }
});

for (const boundary of ["manual", "disabled", "json", "rpc", "print", "child"] as const)
  test(`registered templates preserve ${boundary} routing boundary`, async () => {
    const h = await commandHarness({
      mode: ["json", "rpc", "print"].includes(boundary)
        ? (boundary as "json" | "rpc" | "print")
        : "tui",
      child: boundary === "child",
    });
    try {
      if (boundary === "manual") h.session.setThinkingLevel("medium");
      if (boundary === "disabled") await h.session.prompt("/model-roles disable");
      const calls: string[] = [];
      h.respond((_context, options, _state, model) => {
        calls.push(`${model.id}:${options?.reasoning}`);
        return fauxAssistantMessage("Pinned synthetic command answer");
      });
      await h.session.prompt("/plan Synthetic task");
      assert.deepEqual(calls, [`default:${boundary === "manual" ? "medium" : "high"}`]);
      assert.deepEqual(h.errors, []);
    } finally {
      await h.close();
    }
  });

test("cancelling template selection restores the raw command and does not execute", async () => {
  const h = await commandHarness();
  try {
    const text = "/plan Design a synthetic feature\nInclude tests";
    h.ui.cancelSelection();
    h.respond(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return fauxAssistantMessage('{"matches":["fast"]}');
    });
    await h.session.prompt(text, {
      images: [{ type: "image", data: "SYNTHETIC_IMAGE", mimeType: "image/png" }],
    });
    assert.equal(h.ui.editor, text);
    assert.equal(h.session.messages.length, 0);
    assert.equal(h.session.model?.id, "default");
    assert.ok(h.ui.notifications.some((item) => /Reattach images/.test(item)));
    assert.deepEqual(h.errors, []);
  } finally {
    await h.close();
  }
});

for (const boundary of ["default-only", "unavailable-custom", "oversized"] as const)
  test(`registered template uses fallback without classification: ${boundary}`, async () => {
    const h = await commandHarness();
    try {
      const store = new ConfigStore(h.dir);
      const snapshot = await store.load();
      assert.ok(snapshot);
      const settings = config();
      settings.roles.default = {
        model: { provider: "fixture", id: "owner/fast" },
        effort: "low",
      };
      if (boundary === "default-only") delete settings.roles.fast;
      if (boundary === "unavailable-custom") {
        const role = settings.roles.fast;
        assert.ok(role);
        role.model = { provider: "fixture", id: "missing" };
      }
      await store.save(settings, snapshot.revision);
      await h.session.reload();
      const calls: string[] = [];
      h.respond((_context, options, _state, model) => {
        calls.push(`${model.id}:${options?.reasoning}`);
        return fauxAssistantMessage("Default command answer");
      });
      await h.session.prompt(
        `/plan ${boundary === "oversized" ? "x".repeat(16384) : "Synthetic task"}`,
      );
      assert.deepEqual(calls, ["owner/fast:low"]);
      assert.equal(h.faux.state.callCount, 1);
      assert.deepEqual(h.errors, []);
    } finally {
      await h.close();
    }
  });

test("template selector failure uses default and still expands the task", async () => {
  const h = await commandHarness();
  try {
    let execution = "";
    const calls: string[] = [];
    h.respond(
      fauxAssistantMessage("Invalid selector response"),
      (context, options, _state, model) => {
        execution = JSON.stringify(context.messages);
        calls.push(`${model.id}:${options?.reasoning}`);
        return fauxAssistantMessage("Fallback command answer");
      },
    );
    await h.session.prompt("/plan Synthetic task");
    assert.equal(h.faux.state.callCount, 2);
    assert.deepEqual(calls, ["default:high"]);
    assert.match(execution, /SYNTHETIC_TEMPLATE_BODY/);
    assert.deepEqual(h.errors, []);
  } finally {
    await h.close();
  }
});

test("queued templates and skills stay on the active role without another selector", async () => {
  const h = await commandHarness();
  try {
    const calls: string[] = [];
    h.respond(
      fauxAssistantMessage('{"matches":["fast"]}'),
      async (_context, options, _state, model) => {
        calls.push(`${model.id}:${options?.reasoning}`);
        await h.session.prompt("/plan Queued plan", { streamingBehavior: "followUp" });
        await h.session.prompt("/skill:synthetic Queued skill", { streamingBehavior: "steer" });
        return fauxAssistantMessage("Initial command answer");
      },
      (_context, options, _state, model) => {
        calls.push(`${model.id}:${options?.reasoning}`);
        return fauxAssistantMessage("Queued skill answer");
      },
      (_context, options, _state, model) => {
        calls.push(`${model.id}:${options?.reasoning}`);
        return fauxAssistantMessage("Queued plan answer");
      },
    );
    await h.session.prompt("/plan Initial synthetic task");
    await h.session.waitForIdle();
    assert.equal(h.faux.state.callCount, 4);
    assert.deepEqual(calls, ["owner/fast:low", "owner/fast:low", "owner/fast:low"]);
    assert.deepEqual(h.errors, []);
  } finally {
    await h.close();
  }
});

test("removed templates are no longer eligible after reload", async () => {
  const h = await commandHarness();
  try {
    await rm(join(h.dir, "prompts", "plan.md"));
    await h.session.reload();
    h.respond(fauxAssistantMessage("Unknown slash prompt"));
    await h.session.prompt("/plan Removed template");
    assert.equal(h.faux.state.callCount, 1);
    assert.equal(h.session.model?.id, "default");
    assert.deepEqual(h.errors, []);
  } finally {
    await h.close();
  }
});
