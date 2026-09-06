import assert from "node:assert/strict";
import { test } from "node:test";
import { fauxAssistantMessage, fauxText, fauxToolCall } from "@earendil-works/pi-ai";
import { ConfigStore } from "../../src/config/store.js";
import { AUTO_SETUP_TOOL } from "../../src/pi/auto-setup-controller.js";
import { sdkHarness } from "../support/sdk.js";

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

async function submitResearch(h: Awaited<ReturnType<typeof sdkHarness>>) {
  h.ui.customAnswers.push([defaultModel, fastModel]);
  h.ui.answers.push(true);
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
  await h.session.prompt("/model-roles auto-setup");
  await h.session.waitForIdle();
}

test("confirmed Auto Setup save preserves the active model and writes only the reviewed role diff", async () => {
  const h = await sdkHarness();
  try {
    await submitResearch(h);
    h.ui.answers.push("Confirm settings", true, true);
    await h.session.prompt("/model-roles auto-setup review");
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

test("Auto Setup cancellation makes no configuration write", async () => {
  const h = await sdkHarness();
  try {
    await h.session.prompt("/model-roles auto-setup cancel");
    const store = new ConfigStore(h.dir);
    const snapshot = await store.load(false);
    assert.ok(snapshot);
    assert.deepEqual(Object.keys(snapshot.config.roles), ["default"]);
    assert.ok(h.ui.notifications.some((message) => message.includes("no active research")));
  } finally {
    await h.close();
  }
});
