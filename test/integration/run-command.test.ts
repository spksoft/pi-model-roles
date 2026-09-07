import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { ConfigStore } from "../../src/config/store.js";
import { config } from "../support/fixtures.js";
import { sdkHarness } from "../support/sdk.js";

async function executionHarness(options: Parameters<typeof sdkHarness>[0] = {}) {
  const commands: Array<{ args: string; model: string | undefined; effort: string | undefined }> =
    [];
  let settle = () => {};
  const settled = new Promise<void>((resolve) => {
    settle = resolve;
  });
  const h = await sdkHarness({
    ...options,
    prompts: true,
    skills: true,
    prepare: async (dir, faux) => {
      const store = new ConfigStore(dir);
      const snapshot = await store.load(true);
      assert.ok(snapshot);
      await store.save(config(), snapshot.revision);
      await writeFile(join(dir, "synthetic-plan.html"), "SYNTHETIC_PLAN_BODY");
      await mkdir(join(dir, "prompts"), { recursive: true });
      await writeFile(join(dir, "prompts", "plan.md"), "SYNTHETIC_TEMPLATE_BODY $ARGUMENTS");
      await mkdir(join(dir, "skills", "synthetic"), { recursive: true });
      await writeFile(
        join(dir, "skills", "synthetic", "SKILL.md"),
        "---\nname: synthetic\ndescription: Synthetic fixture\n---\nSYNTHETIC_SKILL_BODY",
      );
      await options.prepare?.(dir, faux);
    },
    extensions: [
      (pi) => {
        pi.registerCommand("execute-plan", {
          description: "SYNTHETIC_COMMAND_METADATA",
          handler: async (args, ctx) => {
            commands.push({ args, model: ctx.model?.id, effort: ctx.thinkingLevel });
            // Simulate the command owner's normal preparation and generated kickoff.
            const plan = await readFile(join(ctx.cwd, "synthetic-plan.html"), "utf8");
            pi.sendUserMessage(`SYNTHETIC_GENERATED_INSTRUCTIONS\n${plan}`);
          },
        });
        pi.on("agent_settled", () => settle());
      },
      ...(options.extensions ?? []),
    ],
  });
  return { h, commands, settled };
}

test("the target command retains final model authority after wrapper selection", {
  timeout: 5000,
}, async () => {
  const { h, settled } = await executionHarness({
    extensions: [
      (pi) => {
        pi.registerCommand("pinned-command", {
          description: "Synthetic owner with an explicit model choice",
          handler: async (_args, ctx) => {
            const model = ctx.modelRegistry.find("fixture", "default");
            if (!model || !(await pi.setModel(model))) throw new Error("Synthetic pin failed");
            pi.setThinkingLevel("medium");
            pi.sendUserMessage("Owner-pinned synthetic task");
          },
        });
      },
    ],
  });
  try {
    const calls: string[] = [];
    h.respond(fauxAssistantMessage('{"matches":["fast"]}'), (_context, options, _state, model) => {
      calls.push(`${model.id}:${options?.reasoning}`);
      return fauxAssistantMessage("Pinned target completed");
    });
    await h.session.prompt("/model-roles run /pinned-command");
    await settled;
    assert.deepEqual(calls, ["default:medium"]);
    assert.equal(h.faux.state.callCount, 2);
    assert.deepEqual(h.errors, []);
  } finally {
    await h.close();
  }
});

test("target handler failures stay Pi errors and are not retried or replayed", {
  timeout: 5000,
}, async () => {
  let attempts = 0;
  const { h } = await executionHarness({
    extensions: [
      (pi) => {
        pi.registerCommand("broken-command", {
          description: "Synthetic failing owner",
          handler: async () => {
            attempts++;
            throw new Error("SYNTHETIC_TARGET_FAILURE");
          },
        });
      },
    ],
  });
  try {
    h.respond(fauxAssistantMessage('{"matches":["fast"]}'));
    await h.session.prompt("/model-roles run /broken-command");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(attempts, 1);
    assert.equal(h.faux.state.callCount, 1);
    assert.equal(h.session.model?.id, "owner/fast");
    assert.deepEqual(h.errors, ["SYNTHETIC_TARGET_FAILURE"]);
    assert.equal(h.session.messages.length, 0);
  } finally {
    await h.close();
  }
});

test("run routes before the original command, preserves arguments and does not reroute generated input", {
  timeout: 5000,
}, async () => {
  const { h, commands, settled } = await executionHarness();
  try {
    const args = 'docs/plan/feature.html  "two words"\nรายละเอียด  ';
    const target = `/execute-plan ${args}`;
    const calls: string[] = [];
    let selector = "";
    let selectedTask: unknown;
    let execution = "";
    h.respond(
      (context, options, _state, model) => {
        assert.deepEqual(commands, []);
        calls.push(`${model.id}:${options?.reasoning}`);
        selector = JSON.stringify(context);
        const message = context.messages[0];
        assert.ok(message?.role === "user" && Array.isArray(message.content));
        const block = message.content[0];
        assert.ok(block?.type === "text");
        selectedTask = JSON.parse(block.text).task;
        return fauxAssistantMessage('{"matches":["fast"]}');
      },
      (context, options, _state, model) => {
        calls.push(`${model.id}:${options?.reasoning}`);
        execution = JSON.stringify(context.messages);
        return fauxAssistantMessage("Synthetic implementation complete");
      },
    );
    await h.session.prompt(`/model-roles run ${target}`);
    await settled;
    assert.equal(selectedTask, target);
    assert.deepEqual(commands, [{ args, model: "owner/fast", effort: "low" }]);
    assert.deepEqual(calls, ["default:undefined", "owner/fast:low"]);
    assert.doesNotMatch(selector, /SYNTHETIC_(PLAN_BODY|GENERATED_INSTRUCTIONS|COMMAND_METADATA)/);
    assert.match(execution, /SYNTHETIC_PLAN_BODY/);
    const metadata = JSON.stringify(
      h.session.sessionManager.getBranch().filter((entry) => entry.type === "custom"),
    );
    assert.doesNotMatch(metadata, /feature\.html|SYNTHETIC_PLAN_BODY|two words/);
    assert.deepEqual(h.errors, []);
  } finally {
    await h.close();
  }
});

test("run refuses unknown, built-in, malformed and recursive commands before selection", async () => {
  const { h, commands } = await executionHarness();
  try {
    for (const target of [
      "",
      "ordinary task",
      "/missing task",
      "/model",
      "/reload",
      "/skill:missing",
      "/execute-plan\ttask",
      "/execute-plan\n",
      "/model-roles run /execute-plan task",
      "/model-roles:1 run /execute-plan task",
    ]) {
      await h.session.prompt(`/model-roles run ${target}`);
    }
    assert.equal(h.faux.state.callCount, 0);
    assert.deepEqual(commands, []);
    assert.equal(h.ui.notifications.length, 10);
    assert.ok(h.ui.notifications.every((message) => message.includes("/model-roles run /command")));
    assert.deepEqual(h.errors, []);
  } finally {
    await h.close();
  }
});

for (const boundary of ["manual", "disabled", "default-only", "invalid-config"] as const)
  test(`run preserves ${boundary} behavior and dispatches without classification`, {
    timeout: 5000,
  }, async () => {
    const { h, commands, settled } = await executionHarness();
    try {
      if (boundary === "manual") h.session.setThinkingLevel("medium");
      if (boundary === "disabled") await h.session.prompt("/model-roles disable");
      if (boundary === "default-only" || boundary === "invalid-config") {
        const store = new ConfigStore(h.dir);
        if (boundary === "default-only") {
          const snapshot = await store.load();
          assert.ok(snapshot);
          const settings = config();
          delete settings.roles.fast;
          settings.roles.default = {
            model: { provider: "fixture", id: "owner/fast" },
            effort: "low",
          };
          await store.save(settings, snapshot.revision);
        } else await writeFile(store.path, "version: 999\n");
        await h.session.reload();
      }
      const calls: string[] = [];
      h.respond((_context, options, _state, model) => {
        calls.push(`${model.id}:${options?.reasoning}`);
        return fauxAssistantMessage("Synthetic command answer");
      });
      await h.session.prompt("/model-roles run /execute-plan synthetic-plan.html");
      await settled;
      const model = boundary === "default-only" ? "owner/fast" : "default";
      const effort =
        boundary === "default-only" ? "low" : boundary === "manual" ? "medium" : "high";
      assert.deepEqual(calls, [`${model}:${effort}`]);
      assert.deepEqual(commands, [{ args: "synthetic-plan.html", model, effort }]);
      assert.deepEqual(h.errors, []);
    } finally {
      await h.close();
    }
  });

for (const mode of ["json", "rpc", "print", "tui"] as const)
  test(`run stays inactive in ${mode === "tui" ? "child" : mode}`, async () => {
    const { h, commands } = await executionHarness({ mode, child: mode === "tui" });
    try {
      await h.session.prompt("/model-roles run /execute-plan synthetic-plan.html");
      assert.equal(h.faux.state.callCount, 0);
      assert.deepEqual(commands, []);
      assert.deepEqual(h.errors, []);
    } finally {
      await h.close();
    }
  });

test("run refuses busy work immediately instead of waiting or queueing", {
  timeout: 5000,
}, async () => {
  const { h, commands } = await executionHarness();
  try {
    h.respond(async () => {
      await h.session.prompt("/model-roles run /execute-plan synthetic-plan.html");
      return fauxAssistantMessage("Existing work finished");
    });
    await h.session.sendUserMessage("Existing synthetic work");
    assert.equal(h.faux.state.callCount, 1);
    assert.deepEqual(commands, []);
    assert.ok(h.ui.notifications.some((message) => /wait for current work/.test(message)));
    assert.deepEqual(h.errors, []);
  } finally {
    await h.close();
  }
});

test("run cancellation restores the wrapper and never invokes the target", {
  timeout: 5000,
}, async () => {
  const { h, commands } = await executionHarness();
  try {
    h.ui.cancelSelection();
    h.respond(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return fauxAssistantMessage('{"matches":["fast"]}');
    });
    const submission = "/model-roles run /execute-plan synthetic-plan.html";
    await h.session.prompt(submission);
    assert.equal(h.ui.editor, submission);
    assert.deepEqual(commands, []);
    assert.equal(h.session.messages.length, 0);
    assert.equal(h.session.model?.id, "default");
    assert.deepEqual(h.errors, []);
  } finally {
    await h.close();
  }
});

test("run selector failure falls back once, without replaying the target", {
  timeout: 5000,
}, async () => {
  const { h, commands, settled } = await executionHarness();
  try {
    h.respond(
      fauxAssistantMessage("Invalid selector output"),
      fauxAssistantMessage("Command completed"),
    );
    await h.session.prompt("/model-roles run /execute-plan synthetic-plan.html");
    await settled;
    assert.equal(h.faux.state.callCount, 2);
    assert.deepEqual(commands, [{ args: "synthetic-plan.html", model: "default", effort: "high" }]);
    assert.deepEqual(h.errors, []);
  } finally {
    await h.close();
  }
});

for (const target of ["/plan Synthetic task", "/skill:synthetic Synthetic task"])
  test(`run also forwards ${target.split(" ")[0]} through normal expansion exactly once`, {
    timeout: 5000,
  }, async () => {
    const { h, commands, settled } = await executionHarness();
    try {
      const calls: string[] = [];
      let execution = "";
      h.respond(fauxAssistantMessage('{"matches":["fast"]}'), (context, options, _state, model) => {
        calls.push(`${model.id}:${options?.reasoning}`);
        execution = JSON.stringify(context.messages);
        return fauxAssistantMessage("Expanded command completed");
      });
      await h.session.prompt(`/model-roles run ${target}`);
      await settled;
      assert.equal(h.faux.state.callCount, 2);
      assert.deepEqual(calls, ["owner/fast:low"]);
      assert.match(execution, /SYNTHETIC_(TEMPLATE|SKILL)_BODY/);
      assert.deepEqual(commands, []);
      assert.deepEqual(h.errors, []);
    } finally {
      await h.close();
    }
  });
