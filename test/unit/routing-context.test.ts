import assert from "node:assert/strict";
import { test } from "node:test";
import { LIMITS } from "../../src/core/defaults.js";
import { parseContextMatch } from "../../src/core/classifier-protocol.js";
import { boundedText, validRoutingContext } from "../../src/core/routing-context.js";
import {
  selectModelForTask,
  selectModelWithContext,
  validRequest,
} from "../../src/core/selection.js";
import type { RoutingContext } from "../../src/core/types.js";
import { projectRoutingContext } from "../../src/pi/routing-context.js";
import { BASE, FAST, MODELS, dependencies, request } from "../support/fixtures.js";

const history = (): RoutingContext => ({
  version: 1,
  messages: [
    { kind: "user", text: "Rename this label without changing behavior." },
    { kind: "assistant", text: "One occurrence remains." },
  ],
  truncated: false,
  previousRole: "fast",
});
const active = () => request({ task: "Continue", current: { model: FAST, effort: "low" } });

test("projection allowlists dialogue and summaries including retainedTail, not tools or custom data", () => {
  const entries = [
    {
      type: "compaction",
      summary: "Retained goal",
      retainedTail: [
        { role: "user", content: "Apply the chosen plan" },
        { role: "toolResult", content: "RAW_TOOL_SENTINEL" },
      ],
    },
    { type: "custom_message", content: "CUSTOM_SENTINEL" },
    { type: "custom", data: { content: "CUSTOM_DATA_SENTINEL" } },
    {
      type: "message",
      message: {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "THINKING_SENTINEL" },
          { type: "toolCall", name: "bash", arguments: { command: "ARGS_SENTINEL" } },
          { type: "image", data: "IMAGE_SENTINEL" },
          { type: "text", text: "Visible progress" },
        ],
      },
    },
    { type: "branch_summary", summary: "Retained branch note" },
  ];
  const context = projectRoutingContext(entries);
  assert.deepEqual(
    context.messages.map((m) => m.text),
    ["Retained goal", "Apply the chosen plan", "Visible progress", "Retained branch note"],
  );
  assert.doesNotMatch(JSON.stringify(context), /SENTINEL/);
  assert.ok(validRoutingContext(context));
  assert.deepEqual(
    projectRoutingContext([{ type: "compaction", summary: "Legacy summary" }]).messages,
    [{ kind: "summary", text: "Legacy summary" }],
  );
});

test("projection removes recognized skill bodies and bounds Unicode text without mutating entries", () => {
  const skill =
    '<skill name="demo" location="/private/skill">\nSKILL_SENTINEL\n</skill>\n\nImplement the plan';
  const projected = projectRoutingContext([
    { type: "message", message: { role: "user", content: skill } },
  ]);
  assert.equal(projected.messages[0]?.text, "/skill:demo Implement the plan");
  assert.doesNotMatch(JSON.stringify(projected), /SKILL_SENTINEL|private/);
  const blocks = projectRoutingContext([
    {
      type: "message",
      message: {
        role: "user",
        content: [
          { type: "text", text: skill },
          { type: "text", text: "Additional visible constraint" },
        ],
      },
    },
  ]);
  assert.match(blocks.messages[0]?.text ?? "", /Additional visible constraint/);
  assert.doesNotMatch(JSON.stringify(blocks), /SKILL_SENTINEL|private/);
  const entries = Array.from({ length: 40 }, (_, i) => ({
    type: "message",
    message: { role: "user", content: `${i} ${"界🌟".repeat(2500)}` },
  }));
  const before = structuredClone(entries);
  const result = projectRoutingContext(entries);
  assert.deepEqual(entries, before);
  assert.ok(result.truncated);
  assert.ok(validRoutingContext(result));
  assert.ok(result.messages.at(-1)?.text.startsWith("39 "));
  assert.ok(
    result.messages.reduce((n, m) => n + Buffer.byteLength(m.text), 0) <= LIMITS.historyBytes,
  );
  assert.doesNotMatch(JSON.stringify(result), /�/);
  for (let bytes = 0; bytes < 20; bytes++) {
    const cut = boundedText("a界🌟b界🌟", bytes);
    assert.ok(Buffer.byteLength(cut) <= bytes);
    assert.ok("a界🌟b界🌟".startsWith(cut));
  }
});

test("context validation is strict and the v1 request does not silently accept history", () => {
  assert.equal(validRequest({ ...request(), context: history() }), false);
  for (const value of [
    { ...history(), version: 2 },
    { ...history(), private: true },
    { ...history(), previousRole: "__proto__" },
    { ...history(), messages: [{ kind: ["user"], text: "x" }] },
    { ...history(), messages: [{ kind: "user", text: "x", secret: true }] },
    { ...history(), messages: [{ kind: "toolResult", text: "x" }] },
    { ...history(), messages: [{ kind: Object.create(null), text: "x" }] },
    { ...history(), messages: [{ kind: "user", text: "x".repeat(4097) }] },
    { ...history(), messages: Array.from({ length: 13 }, () => ({ kind: "user", text: "x" })) },
  ])
    assert.equal(validRoutingContext(value), false);
});

test("contextual protocol rejects extra fields, invented roles, mixed continuation, and legacy output", () => {
  for (const text of [
    '{"matches":[]}',
    '{"action":"continue","matches":["fast"]}',
    '{"action":"classify","matches":["missing"]}',
    '{"action":"continue","matches":[],"extra":true}',
    '{"action":"new","matches":[]}',
    "```json\n{}\n```",
  ])
    assert.equal(parseContextMatch(text, ["fast"]), undefined);
  assert.deepEqual(parseContextMatch('{"action":"continue","matches":[]}', ["fast"]), {
    action: "continue",
    matches: [],
  });
});

test("continuation preserves an unchanged eligible assignment without persisting context", async () => {
  const deps = dependencies('{"action":"continue","matches":[]}');
  const before = history();
  const result = await selectModelWithContext(active(), deps, before);
  assert.equal(result.reason, "continued");
  assert.equal(result.fallback, false);
  assert.ok(result.status === "selected");
  assert.deepEqual(result.model, FAST);
  assert.equal(result.effort, "low");
  assert.equal(result.routing?.messages, 2);
  assert.doesNotMatch(JSON.stringify(result), /One occurrence|Rename this label/);
  assert.deepEqual(before, history());
});

test("continuation requires history, current pair identity, assignment, and final availability", async () => {
  for (const context of [
    { ...history(), messages: [] },
    { ...history(), previousRole: "gone" },
  ])
    assert.equal(
      (
        await selectModelWithContext(
          active(),
          dependencies('{"action":"continue","matches":[]}'),
          context,
        )
      ).reason,
      "invalid_response",
    );
  assert.equal(
    (
      await selectModelWithContext(
        request(),
        dependencies('{"action":"continue","matches":[]}'),
        history(),
      )
    ).reason,
    "invalid_response",
  );
  const deps = dependencies('{"action":"continue","matches":[]}');
  deps.config.roles.fast = { ...deps.config.roles.fast!, effort: "high" };
  assert.equal(
    (await selectModelWithContext(active(), deps, history())).reason,
    "invalid_response",
  );
  let models = MODELS;
  const disappearing = dependencies();
  disappearing.models = () => models;
  disappearing.classify = async () => {
    models = MODELS.filter((m) => m.ref.id === BASE.id);
    return { text: '{"action":"continue","matches":[]}' };
  };
  assert.equal(
    (await selectModelWithContext(active(), disappearing, history())).reason,
    "invalid_response",
  );
  const restricted = await selectModelWithContext(
    request({ ...active(), allowedModels: [BASE] }),
    dependencies(),
    history(),
  );
  assert.equal(restricted.reason, "default_only");
});

test("changed intent can reclassify; ambiguity and explicit pins retain conservative precedence", async () => {
  const deps = dependencies('{"action":"classify","matches":[]}');
  const newTask = await selectModelWithContext(active(), deps, history());
  assert.ok(newTask.status === "selected");
  assert.deepEqual(newTask.model, BASE);
  deps.config.roles.other = { model: BASE, effort: "high", description: "Overlapping task" };
  deps.classify = async () => ({ text: '{"action":"classify","matches":["fast","other"]}' });
  assert.equal((await selectModelWithContext(active(), deps, history())).reason, "ambiguous");
  deps.classify = async () => {
    throw new Error("must not classify");
  };
  assert.equal(
    (await selectModelWithContext(request({ ...active(), explicitModel: FAST }), deps, history()))
      .reason,
    "explicit",
  );
  assert.equal(
    (await selectModelWithContext(request({ ...active(), paused: true }), deps, history())).reason,
    "manual",
  );
});

test("contextual continuation cannot bypass image eligibility or cancellation", async () => {
  const deps = dependencies('{"action":"continue","matches":[]}');
  deps.models = () => MODELS.map((model) => ({ ...model, images: model.ref.id === BASE.id }));
  let calls = 0;
  deps.classify = async () => {
    calls++;
    return { text: '{"action":"continue","matches":[]}' };
  };
  const image = await selectModelWithContext(
    request({ ...active(), requiresImages: true }),
    deps,
    history(),
  );
  assert.equal(image.reason, "default_only");
  assert.ok(image.status === "selected");
  assert.deepEqual(image.model, BASE);
  const stopped = new AbortController();
  stopped.abort();
  assert.equal(
    (
      await selectModelWithContext(
        request({ ...active(), signal: stopped.signal }),
        deps,
        history(),
      )
    ).status,
    "cancelled",
  );
  assert.equal(calls, 0);
  const pending = new AbortController();
  deps.models = () => MODELS;
  deps.classify = async () => {
    pending.abort();
    return { text: '{"action":"continue","matches":[]}' };
  };
  assert.equal(
    (
      await selectModelWithContext(
        request({ ...active(), signal: pending.signal }),
        deps,
        history(),
      )
    ).status,
    "cancelled",
  );
});

test("oldest context is dropped for budget; prompt-only API ignores context configuration", async () => {
  const deps = dependencies();
  deps.config.selectorContext = "conversation";
  deps.models = () => MODELS.map((m) => ({ ...m, contextWindow: 8000 }));
  const context = {
    ...history(),
    messages: Array.from({ length: 4 }, () => ({ kind: "user" as const, text: "界".repeat(1300) })),
  };
  deps.classify = async (input) => {
    const data = JSON.parse(input.text);
    assert.equal(data.task, active().task);
    assert.ok(data.context.messages.length < 4);
    assert.ok(data.context.truncated);
    assert.ok(
      Buffer.byteLength(input.text + input.systemPrompt) + LIMITS.outputTokens + 1024 <= 8000,
    );
    return { text: '{"action":"classify","matches":["fast"]}' };
  };
  assert.equal((await selectModelWithContext(active(), deps, context)).reason, "matched");
  deps.classify = async (input) => {
    assert.equal(JSON.parse(input.text).context, undefined);
    return { text: '{"matches":["fast"]}' };
  };
  assert.equal((await selectModelForTask(active(), deps)).reason, "matched");
});

test("projection receipts separate clipping, excluded categories, partial observations and unknown summary freshness", async () => {
  const { projectRoutingInput } = await import("../../src/pi/routing-context.js");
  const { context, receipt } = projectRoutingInput([
    { type: "custom", data: { secret: "PRIVATE_CUSTOM_SENTINEL" } },
    {
      type: "compaction",
      summary: "Summary freshness cannot be verified",
      retainedTail: [{ role: "toolResult", content: "PRIVATE_TOOL_SENTINEL" }],
    },
    {
      type: "message",
      message: {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "PRIVATE_THINKING_SENTINEL" },
          { type: "image", data: "PRIVATE_IMAGE_SENTINEL" },
          { type: "text", text: "Visible" },
        ],
      },
    },
    {
      type: "message",
      message: {
        role: "user",
        content: '<skill name="demo" location="private">\nPRIVATE_SKILL_SENTINEL\n</skill>',
      },
    },
  ]);
  assert.deepEqual(receipt.included, { user: 1, assistant: 1, summary: 1 });
  assert.deepEqual(receipt.omitted, {
    tools: 1,
    reasoning: 1,
    images: 1,
    custom: 1,
    skillBodies: 1,
  });
  assert.equal(receipt.byteLimit, false);
  assert.equal(receipt.summaryFreshness, "unknown");
  assert.equal(receipt.observationsPartial, false);
  assert.ok(validRoutingContext(context));
  assert.doesNotMatch(JSON.stringify(receipt), /PRIVATE_|freshness cannot|Visible/);
  assert.equal(validRoutingContext({ ...context, receipt }), false);
  const clipped = projectRoutingInput(
    Array.from({ length: 20 }, () => ({
      type: "message",
      message: { role: "user", content: "a" },
    })),
  );
  assert.equal(clipped.receipt.messageLimit, true);
  assert.equal(clipped.receipt.observationsPartial, true);
  const exhausted = projectRoutingInput(
    Array.from({ length: 5000 }, () => ({ type: "custom", data: "DO_NOT_READ" })),
  );
  assert.equal(exhausted.receipt.omitted.custom, 4096);
  assert.equal(exhausted.receipt.observationsPartial, true);
  const deps = dependencies();
  deps.models = () => MODELS.map((model) => ({ ...model, contextWindow: 8000 }));
  const projected = projectRoutingInput([
    { type: "message", message: { role: "user", content: "界".repeat(5000) } },
  ]);
  assert.equal(projected.receipt.byteLimit, true);
  deps.classify = async (input) => {
    assert.doesNotMatch(input.text, /observationsPartial|included|byteLimit|budgetRemovedMessages/);
    return { text: '{"action":"classify","matches":[]}' };
  };
  const result = await selectModelWithContext(request(), deps, projected.context);
  assert.equal(result.routing?.budgetRemovedMessages, 1);
  assert.equal(projected.context.messages.length, 1);
});
