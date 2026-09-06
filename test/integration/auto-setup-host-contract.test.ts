import assert from "node:assert/strict";
import { test } from "node:test";
import { fauxAssistantMessage, fauxText, fauxToolCall } from "@earendil-works/pi-ai";
import { AUTO_SETUP_TOOL } from "../../src/pi/auto-setup-controller.js";
import { sdkHarness } from "../support/sdk.js";

const defaultModel = { provider: "fixture", id: "default" };
const fastModel = { provider: "fixture", id: "owner/fast" };

function proposal() {
  return {
    version: 1,
    summary: "Offline, unverified comparison for a synthetic fixture.",
    assessments: [
      {
        model: defaultModel,
        status: "offline_knowledge",
        summary: "No web evidence was collected in this synthetic test.",
        sources: [],
        caveats: ["Offline assessment only."],
      },
      {
        model: fastModel,
        status: "offline_knowledge",
        summary: "No web evidence was collected in this synthetic test.",
        sources: [],
        caveats: ["Offline assessment only."],
      },
    ],
    roles: [
      {
        id: "quick",
        model: fastModel,
        effort: "low",
        description: "Use for small well-specified edits.",
        rationale: "The selected fixture advertises a supported low effort.",
        effortRationale: "Low is supported by the selected fixture.",
        evidenceModels: [fastModel],
        uncertainty: "Synthetic offline fixture; not measured evidence.",
      },
    ],
  };
}

test("Auto Setup dispatches a normal active-model turn, settles before review, and cleans its tool", async () => {
  const h = await sdkHarness();
  try {
    assert.ok(
      h.session.getAllTools().some((tool) => tool.name === AUTO_SETUP_TOOL),
      `${h.session
        .getAllTools()
        .map((tool) => tool.name)
        .join(",")} errors:${h.errors.join(";")}`,
    );
    h.ui.customAnswers.push([defaultModel, fastModel]);
    h.ui.answers.push(true);
    let generation = 0;
    let requestId = "";
    h.respond(
      (context, _options, _state, model) => {
        assert.equal(model.id, "default");
        const message = context.messages.at(-1);
        assert.equal(message?.role, "user");
        const content =
          message?.role === "user" && Array.isArray(message.content)
            ? message.content[0]
            : undefined;
        const text = content?.type === "text" ? content.text : "";
        const id = text.match(/requestId\s+("[^"]+")/)?.[1];
        const run = text.match(/generation\s+(\d+)/)?.[1];
        assert.ok(id);
        assert.ok(run);
        requestId = JSON.parse(id);
        generation = Number(run);
        return fauxAssistantMessage(
          [fauxToolCall(AUTO_SETUP_TOOL, { requestId, generation, proposal: proposal() })],
          { stopReason: "toolUse" },
        );
      },
      fauxAssistantMessage([fauxText("Structured proposal submitted.")]),
    );
    await h.session.prompt("/model-roles auto-setup");
    await h.session.waitForIdle();
    assert.ok(requestId);
    assert.equal(h.session.model?.id, "default");
    assert.equal(h.session.thinkingLevel, "high");
    assert.equal(h.faux.state.callCount, 2);
    assert.equal(h.errors.length, 0);
    assert.ok(
      h.ui.notifications.some((message) => message.includes("proposal is ready")),
      `${h.ui.notifications.join("\n")}\n${JSON.stringify(h.session.messages)}`,
    );
    assert.equal(h.session.extensionRunner.getActiveTools?.().includes(AUTO_SETUP_TOOL), false);
  } finally {
    await h.close();
  }
});
