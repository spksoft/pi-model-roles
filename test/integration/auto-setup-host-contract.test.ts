import assert from "node:assert/strict";
import { test } from "node:test";
import { fauxAssistantMessage, fauxText, fauxToolCall } from "@earendil-works/pi-ai";
import { autoSetupSubmissionSchema } from "../../src/auto-setup/schema.js";
import type { AutoSetupLifecycleEntry } from "../../src/auto-setup/types.js";
import { AUTO_SETUP_ENTRY } from "../../src/pi/auto-setup-state.js";
import { ConfigStore } from "../../src/config/store.js";
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

for (const scalarCaveats of [false, true]) {
  test(`Auto Setup accepts ${scalarCaveats ? "host-normalized scalar" : "array"} caveats, settles before review, and cleans its tool`, async () => {
    const h = await sdkHarness();
    try {
      assert.ok(
        h.session.getAllTools().some((tool) => tool.name === AUTO_SETUP_TOOL),
        `${h.session
          .getAllTools()
          .map((tool) => tool.name)
          .join(",")} errors:${h.errors.join(";")}`,
      );
      assert.deepEqual(
        h.session.getAllTools().find((tool) => tool.name === AUTO_SETUP_TOOL)?.parameters,
        autoSetupSubmissionSchema,
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
          const report = proposal();
          if (scalarCaveats) {
            for (const assessment of report.assessments) {
              Object.assign(assessment, { caveats: assessment.caveats[0] });
            }
          }
          return fauxAssistantMessage(
            [fauxToolCall(AUTO_SETUP_TOOL, { requestId, generation, proposal: report })],
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
      const entry = h.session.sessionManager
        .getEntries()
        .find((item) => item.type === "custom" && item.customType === AUTO_SETUP_ENTRY);
      assert.ok(entry?.type === "custom");
      const state = entry.data as AutoSetupLifecycleEntry;
      assert.equal(state.state, "ready");
      assert.deepEqual(
        state.draft?.proposal.assessments.map((item) => item.caveats),
        [["Offline assessment only."], ["Offline assessment only."]],
      );
    } finally {
      await h.close();
    }
  });
}

for (const [name, caveats, rejection] of [
  ["excess caveats rejected by the tool schema", Array(5).fill("Not verified."), /caveats/],
  [
    "invalid text rejected by runtime validation",
    [" not trimmed "],
    /invalid_text at assessments\[0\]\.caveats\[0\]/,
  ],
] as const) {
  test(`Auto Setup can correct ${name} without restarting or saving roles`, async () => {
    const h = await sdkHarness();
    try {
      const store = new ConfigStore(h.dir);
      const before = await store.load(false);
      h.ui.customAnswers.push([defaultModel, fastModel]);
      h.ui.answers.push(true);
      let requestId = "";
      let generation = 0;
      h.respond(
        (context) => {
          const message = context.messages.at(-1);
          const content =
            message?.role === "user" && Array.isArray(message.content)
              ? message.content[0]
              : undefined;
          const text = content?.type === "text" ? content.text : "";
          assert.match(text, /retry once with the same requestId and generation/);
          const id = text.match(/requestId\s+("[^"]+")/)?.[1];
          const run = text.match(/generation\s+(\d+)/)?.[1];
          assert.ok(id && run);
          requestId = JSON.parse(id);
          generation = Number(run);
          const invalid = proposal();
          Object.assign(invalid.assessments[0]!, { caveats });
          return fauxAssistantMessage(
            [fauxToolCall(AUTO_SETUP_TOOL, { requestId, generation, proposal: invalid })],
            { stopReason: "toolUse" },
          );
        },
        (context) => {
          const result = context.messages.at(-1);
          assert.equal(result?.role, "toolResult");
          const text =
            result?.role === "toolResult"
              ? result.content
                  .filter((part) => part.type === "text")
                  .map((part) => part.text)
                  .join("\n")
              : "";
          assert.match(text, rejection);
          assert.equal(
            h.session.extensionRunner.getActiveTools?.().includes(AUTO_SETUP_TOOL),
            true,
          );
          return fauxAssistantMessage(
            [fauxToolCall(AUTO_SETUP_TOOL, { requestId, generation, proposal: proposal() })],
            { stopReason: "toolUse" },
          );
        },
        fauxAssistantMessage([fauxText("Corrected proposal submitted.")]),
      );
      await h.session.prompt("/model-roles auto-setup");
      await h.session.waitForIdle();
      assert.equal(h.faux.state.callCount, 3, JSON.stringify(h.session.messages));
      assert.equal(h.errors.length, 0);
      assert.ok(h.ui.notifications.some((message) => message.includes("proposal is ready")));
      assert.ok(
        !h.ui.notifications.some((message) =>
          message.includes("without a valid structured proposal"),
        ),
      );
      assert.equal(h.session.extensionRunner.getActiveTools?.().includes(AUTO_SETUP_TOOL), false);
      assert.equal(h.session.model?.id, "default");
      assert.equal(h.session.thinkingLevel, "high");
      assert.deepEqual(await store.load(false), before);
    } finally {
      await h.close();
    }
  });
}
