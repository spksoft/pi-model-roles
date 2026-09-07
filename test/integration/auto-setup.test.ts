import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fauxAssistantMessage,
  type FauxResponseFactory,
  fauxText,
  fauxToolCall,
} from "@earendil-works/pi-ai";
import { ConfigStore } from "../../src/config/store.js";
import { AUTO_SETUP_TOOL } from "../../src/pi/auto-setup-controller.js";
import { sdkHarness } from "../support/sdk.js";
import { config } from "../support/fixtures.js";

const defaultModel = { provider: "fixture", id: "default" };
const fastModel = { provider: "fixture", id: "owner/fast" };

function offlineProposal() {
  return {
    version: 1,
    summary: "Synthetic offline report.",
    assessments: [
      {
        model: defaultModel,
        status: "offline_knowledge",
        summary: "No web evidence was obtained.",
        sources: [],
        caveats: ["Synthetic test."],
      },
      {
        model: fastModel,
        status: "offline_knowledge",
        summary: "No web evidence was obtained.",
        sources: [],
        caveats: ["Synthetic test."],
      },
    ],
    roles: [
      {
        id: "quick",
        model: fastModel,
        effort: "low",
        description: "Use for small well-specified edits.",
        rationale: "Low effort is advertised by the fixture registry.",
        effortRationale: "Low is supported by this exact fixture model.",
        evidenceModels: [fastModel],
        uncertainty: "Offline synthetic report.",
      },
    ],
  };
}

async function waitFor(condition: () => boolean, failure: string): Promise<void> {
  const deadline = Date.now() + 1_000;
  while (!condition()) {
    if (Date.now() >= deadline) assert.fail(failure);
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
}

async function submitResearch(
  h: Awaited<ReturnType<typeof sdkHarness>>,
  reviewAnswers: Array<string | boolean> = [],
) {
  h.ui.customAnswers.push({ type: "auto-setup" }, [defaultModel, fastModel]);
  h.ui.answers.push(true, ...reviewAnswers);
  h.respond(
    (context) => {
      const message = context.messages.at(-1);
      const content =
        message?.role === "user" && Array.isArray(message.content) ? message.content[0] : undefined;
      const text = content?.type === "text" ? content.text : "";
      const requestId = JSON.parse(text.match(/requestId\s+("[^"]+")/)?.[1] ?? '""');
      const generation = Number(text.match(/generation\s+(\d+)/)?.[1]);
      return fauxAssistantMessage(
        [fauxToolCall(AUTO_SETUP_TOOL, { requestId, generation, proposal: offlineProposal() })],
        { stopReason: "toolUse" },
      );
    },
    fauxAssistantMessage([fauxText("Submitted.")]),
  );
  await h.session.prompt("/model-roles settings");
  await h.session.waitForIdle();
}

test("confirmed Auto Setup save preserves the active model and writes only the reviewed role diff", async () => {
  const h = await sdkHarness();
  try {
    await submitResearch(h, ["Confirm settings", true, true]);
    await waitFor(
      () => h.ui.notifications.some((message) => message.includes("Model roles saved.")),
      "Auto Setup did not finish saving the confirmed role changes.",
    );
    const snapshot = await new ConfigStore(h.dir).load(false);
    assert.ok(snapshot);
    const quick = snapshot.config.roles.quick;
    assert.ok(quick && quick.model !== "inherit");
    assert.equal(quick.model.id, "owner/fast");
    assert.equal(quick.effort, "low");
    assert.equal(h.session.model?.id, "default");
    assert.equal(h.session.thinkingLevel, "high");
    assert.equal(h.errors.length, 0);
  } finally {
    await h.close();
  }
});

for (const routing of ["inherited", "custom", "default-override"] as const)
  test(`Auto Setup research/refinement preserves the actual pair with ${routing} roles`, {
    timeout: 5000,
  }, async () => {
    const h = await sdkHarness();
    try {
      if (routing !== "inherited") {
        const store = new ConfigStore(h.dir);
        const snapshot = await store.load();
        assert.ok(snapshot);
        const settings = config();
        if (routing === "default-override") {
          settings.roles.default = { model: fastModel, effort: "low" };
          delete settings.roles.fast;
        }
        await store.save(settings, snapshot.revision);
        await h.session.reload();
      }
      const calls: Array<{ model: string; effort: string | undefined }> = [];
      h.ui.customAnswers.push({ type: "auto-setup" }, [defaultModel, fastModel]);
      h.ui.answers.push(
        true,
        "Discuss/refine",
        "Tighten the role boundary and keep the same evidence.",
        "Close",
      );
      const submit: FauxResponseFactory = (context, options, _state, model) => {
        calls.push({ model: model.id, effort: options?.reasoning });
        const message = context.messages.at(-1);
        const content =
          message?.role === "user" && Array.isArray(message.content)
            ? message.content[0]
            : undefined;
        const text = content?.type === "text" ? content.text : "";
        const requestId = JSON.parse(text.match(/requestId\s+("[^"]+")/)?.[1] ?? '""');
        const generation = Number(text.match(/generation\s+(\d+)/)?.[1]);
        assert.ok(requestId && generation);
        return fauxAssistantMessage(
          [fauxToolCall(AUTO_SETUP_TOOL, { requestId, generation, proposal: offlineProposal() })],
          { stopReason: "toolUse" },
        );
      };
      const finish: FauxResponseFactory = (_context, options, _state, model) => {
        calls.push({ model: model.id, effort: options?.reasoning });
        return fauxAssistantMessage("Proposal submitted.");
      };
      h.respond(submit, finish, submit, finish);

      await h.session.prompt("/model-roles settings");
      await h.session.waitForIdle();
      await waitFor(
        () =>
          h.faux.state.callCount === 4 &&
          h.ui.selections.filter((item) => item.title === "Auto Setup proposal").length === 2,
        "Auto Setup did not finish the automatic review of the refined proposal.",
      );

      assert.equal(
        h.faux.state.callCount,
        4,
        JSON.stringify({
          messages: h.session.messages,
          errors: h.errors,
          notifications: h.ui.notifications,
        }),
      );
      assert.equal(
        h.ui.selections.filter((item) => item.title === "Auto Setup proposal").length,
        2,
      );
      assert.deepEqual(
        calls,
        Array.from({ length: 4 }, () => ({ model: "default", effort: "high" })),
      );
      assert.equal(h.session.model?.id, "default");
      assert.equal(h.session.thinkingLevel, "high");
      assert.deepEqual(h.errors, []);
    } finally {
      await h.close();
    }
  });

test("automatic Auto Setup review can cancel without a separate review command or configuration write", async () => {
  const h = await sdkHarness();
  try {
    await submitResearch(h, ["Cancel proposal"]);
    await waitFor(
      () => h.ui.notifications.some((message) => message.includes("Auto Setup cancelled")),
      "Auto Setup did not finish cancelling the reviewed proposal.",
    );
    const store = new ConfigStore(h.dir);
    const snapshot = await store.load(false);
    assert.ok(snapshot);
    assert.deepEqual(Object.keys(snapshot.config.roles), ["default"]);
    assert.ok(h.ui.selections.some((item) => item.title === "Auto Setup proposal"));
    assert.ok(h.ui.notifications.some((message) => message.includes("Auto Setup cancelled")));
  } finally {
    await h.close();
  }
});
