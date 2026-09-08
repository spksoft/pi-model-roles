import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test, mock } from "node:test";
import { createProvider, fauxAssistantMessage, type Model } from "@earendil-works/pi-ai";
import { openAIResponsesApi } from "@earendil-works/pi-ai/api/openai-responses.lazy";
import { ConfigStore } from "../../src/config/store.js";
import { completeClassifier, piDependencies, selectorEfforts } from "../../src/pi/adapters.js";
import { selectModelForTask } from "../../src/core/selection.js";
import { BASE, FAST, config, request } from "../support/fixtures.js";
import { sdkHarness } from "../support/sdk.js";

test("real SDK independent selector/executor identity and settings choose/reset disclosure", async () => {
  const h = await sdkHarness();
  try {
    const store = new ConfigStore(h.dir);
    const initial = await store.load();
    assert.ok(initial);
    await store.save(config(), initial.revision);
    await h.session.reload();
    const before = await readFile(store.path, "utf8");
    h.ui.answers.push("choose");
    h.ui.customAnswers.push(undefined);
    await h.session.prompt("/model-roles selector");
    assert.equal(await readFile(store.path, "utf8"), before);
    h.ui.answers.push("choose", "adapter default", true);
    h.ui.customAnswers.push([FAST]);
    await h.session.prompt("/model-roles selector");
    assert.deepEqual((await store.load())?.config.selector, { model: FAST });
    assert.match(
      h.ui.confirmations.at(-1)?.message ?? "",
      /fixture\/owner\/fast.*cost and latency/,
    );
    assert.match(h.ui.confirmations.at(-1)?.message ?? "", /never a second selector provider/);
    assert.equal(h.session.model?.id, "default");
    assert.equal(h.session.thinkingLevel, "high");
    h.respond(
      (_context, options, _state, model) => {
        assert.equal(model.id, "owner/fast");
        assert.equal(options?.reasoning, undefined);
        return fauxAssistantMessage('{"matches":[]}');
      },
      (_context, _options, _state, model) => {
        assert.equal(model.id, "default");
        return fauxAssistantMessage("executed");
      },
    );
    await h.session.prompt("Synthetic independent selection");
    assert.equal(h.faux.state.callCount, 2);
    h.ui.answers.push("reset", false);
    await h.session.prompt("/model-roles selector");
    assert.deepEqual((await store.load())?.config.selector, { model: FAST });
    h.ui.answers.push("reset", true);
    await h.session.prompt("/model-roles selector");
    assert.equal((await store.load())?.config.selector, undefined);
    assert.deepEqual(h.errors, []);
  } finally {
    await h.close();
  }
});

test("real Responses transport receives explicit off and mapped effort with auth/signal/output limits; no network", async () => {
  const h = await sdkHarness();
  const captured: Array<{
    payload: Record<string, unknown>;
    auth: string | null;
    signal?: AbortSignal | null;
  }> = [];
  const ref = { provider: "synthetic-responses", id: "owner/selector" };
  const model: Model<"openai-responses"> = {
    ...h.faux.models[0]!,
    ...ref,
    name: ref.id,
    api: "openai-responses",
    baseUrl: "https://synthetic.invalid/v1",
    thinkingLevelMap: { high: "medium", xhigh: null, max: "high" },
  };
  const api = openAIResponsesApi();
  const provider = createProvider({
    id: ref.provider,
    name: "Synthetic",
    baseUrl: model.baseUrl,
    auth: {
      apiKey: {
        name: "Synthetic",
        login: async () => ({ type: "api_key", key: "not-a-credential" }),
        resolve: async () => ({ auth: { apiKey: "not-a-credential" }, source: "synthetic" }),
      },
    },
    models: [model],
    api: {
      ...api,
      stream: (m, context, options) =>
        api.stream(m, context, {
          ...options,
          fetch: async (_url: string | URL | Request, init?: RequestInit) => {
            captured.push({
              payload: JSON.parse(String(init?.body)),
              auth: new Headers(init?.headers).get("authorization"),
              signal: init?.signal,
            });
            const events = [
              {
                type: "response.output_item.added",
                output_index: 0,
                item: { type: "message", id: "msg_synthetic", role: "assistant", content: [] },
              },
              {
                type: "response.output_text.delta",
                output_index: 0,
                content_index: 0,
                delta: '{"matches":[]}',
              },
              {
                type: "response.completed",
                response: {
                  id: "resp_synthetic",
                  status: "completed",
                  output: [],
                  usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
                },
              },
            ];
            return new Response(
              events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""),
              { headers: { "content-type": "text/event-stream" } },
            );
          },
        }),
    },
  });
  try {
    h.runtime.registerNativeProvider(provider);
    await h.runtime.setRuntimeApiKey(ref.provider, "not-a-credential");
    await h.runtime.refresh({ allowNetwork: false, providers: [ref.provider] });
    for (const effort of [undefined, "off", "high", "max"] as const) {
      const signal = new AbortController().signal;
      const output = await completeClassifier(h.context, {
        model: ref,
        systemPrompt: "Synthetic system",
        text: "Synthetic task",
        signal,
        maxTokens: 2048,
        ...(effort === undefined ? {} : { effort }),
      });
      assert.equal(output.text, '{"matches":[]}');
      const call = captured.at(-1)!;
      assert.equal(call.payload.model, ref.id);
      assert.equal(call.payload.max_output_tokens, 2048);
      assert.deepEqual(
        call.payload.reasoning,
        effort === "high"
          ? { effort: "medium", summary: "auto" }
          : effort === "max"
            ? { effort: "high", summary: "auto" }
            : { effort: "none" },
      );
      assert.equal(call.auth, "Bearer not-a-credential");
      assert.ok(call.signal);
    }
    assert.equal(selectorEfforts(h.context, ref).includes("xhigh"), false);
    await assert.rejects(
      completeClassifier(h.context, {
        model: ref,
        systemPrompt: "x",
        text: "PRIVATE_UNSENT",
        effort: "xhigh",
        signal: new AbortController().signal,
        maxTokens: 2048,
      }),
      /selector_effort_unsupported/,
    );
    assert.equal(captured.length, 4);
    // Explicit unsupported APIs are diagnosed before transmitting context, not silently clamped.
    const cfg = { ...config(), selector: { model: FAST, effort: "off" as const } };
    const result = await selectModelForTask(
      request(),
      piDependencies(h.context, cfg, () => "high"),
    );
    assert.equal(result.reason, "selector_effort_unsupported");
    assert.equal(h.faux.state.callCount, 0);
    const abort = new AbortController();
    abort.abort();
    const cancelled = await selectModelForTask(
      request({ signal: abort.signal }),
      piDependencies(
        h.context,
        { ...config(), selector: { model: ref, effort: "high" } },
        () => "high",
      ),
    );
    assert.equal(cancelled.status, "cancelled");
    assert.equal(captured.length, 4);
    assert.deepEqual(
      {
        model: h.session.model && { provider: h.session.model.provider, id: h.session.model.id },
        effort: h.session.thinkingLevel,
      },
      { model: BASE, effort: "high" },
    );
    h.session.setScopedModels([
      { model, thinkingLevel: "high" },
      ...h.faux.models.map((entry) => ({ model: entry, thinkingLevel: "high" as const })),
    ]);
    for (const effort of [undefined, "low"] as const) {
      const result = await selectModelForTask(
        request(),
        piDependencies(
          h.context,
          { ...config(), selector: { model: ref, ...(effort === undefined ? {} : { effort }) } },
          () => "high",
        ),
      );
      assert.equal(result.reason, "selector_effort_unsupported");
      await assert.rejects(
        completeClassifier(h.context, {
          model: ref,
          text: "PRIVATE_UNSENT",
          systemPrompt: "x",
          effort,
          signal: new AbortController().signal,
          maxTokens: 2048,
        }),
        /selector_effort_unsupported/,
      );
    }
    assert.equal(captured.length, 4);
    const matching = await selectModelForTask(
      request(),
      piDependencies(
        h.context,
        { ...config(), selector: { model: ref, effort: "high" } },
        () => "high",
      ),
    );
    assert.equal(matching.reason, "no_match");
    assert.equal(captured.length, 5);
    assert.deepEqual(captured.at(-1)?.payload.reasoning, { effort: "medium", summary: "auto" });
    assert.ok(matching.status === "selected");
    assert.deepEqual(matching.model, BASE);
    assert.equal(matching.effort, "high");
    h.session.setScopedModels([{ model, thinkingLevel: "max" }]);
    await assert.rejects(
      completeClassifier(h.context, {
        model: ref,
        text: "PRIVATE_UNSENT",
        systemPrompt: "x",
        effort: "high",
        signal: new AbortController().signal,
        maxTokens: 2048,
      }),
      /selector_effort_unsupported/,
    );
    assert.equal(captured.length, 5);
  } finally {
    await h.close();
  }
});

test("selector settings refuse a registry change at confirmation", async () => {
  const h = await sdkHarness();
  try {
    const before = await readFile(new ConfigStore(h.dir).path, "utf8");
    h.ui.answers.push("choose", "adapter default");
    h.ui.customAnswers.push([FAST]);
    const confirm = h.ui.ui.confirm;
    h.ui.ui.confirm = async () => {
      h.runtime.unregisterProvider("fixture");
      return true;
    };
    await h.session.prompt("/model-roles selector");
    assert.equal(await readFile(new ConfigStore(h.dir).path, "utf8"), before);
    assert.match(h.ui.notifications.at(-1) ?? "", /no longer eligible/);
    h.ui.ui.confirm = confirm;
  } finally {
    mock.restoreAll();
    await h.close();
  }
});

test("configured Responses streamSimple refuses effort before transmission but permits unpinned model-only", async () => {
  const h = await sdkHarness();
  let transmissions = 0;
  const ref = { provider: "configured-responses", id: "selector" };
  try {
    h.runtime.registerProvider(ref.provider, {
      api: "openai-responses",
      apiKey: "not-a-credential",
      baseUrl: "https://synthetic.invalid/v1",
      models: [{ ...h.faux.models[0]!, id: ref.id, api: "openai-responses" }],
      streamSimple: (_model, context, options) => {
        transmissions++;
        return h.faux.provider.streamSimple(h.faux.models[0]!, context, options);
      },
    });
    await h.runtime.refresh({ allowNetwork: false, providers: [ref.provider] });
    assert.ok(h.context.modelRegistry.getRegisteredProviderConfig(ref.provider)?.streamSimple);
    for (const effort of ["off", "high"] as const) {
      const result = await selectModelForTask(
        request(),
        piDependencies(h.context, { ...config(), selector: { model: ref, effort } }, () => "high"),
      );
      assert.equal(result.reason, "selector_effort_unsupported");
      assert.ok(result.status === "selected");
      assert.deepEqual(result.model, BASE);
      await assert.rejects(
        completeClassifier(h.context, {
          model: ref,
          effort,
          text: "PRIVATE_UNSENT",
          systemPrompt: "x",
          signal: new AbortController().signal,
          maxTokens: 2048,
        }),
        /selector_effort_unsupported/,
      );
    }
    assert.equal(transmissions, 0);
    h.respond(fauxAssistantMessage('{"matches":[]}'));
    const unpinned = await selectModelForTask(
      request(),
      piDependencies(h.context, { ...config(), selector: { model: ref } }, () => "high"),
    );
    assert.equal(unpinned.reason, "no_match");
    assert.equal(transmissions, 1);
  } finally {
    await h.close();
  }
});

test("pinned unsupported selectors reject omitted effort and invalid UI default, including scope changes", async () => {
  const h = await sdkHarness();
  try {
    const store = new ConfigStore(h.dir);
    const initial = await store.load();
    assert.ok(initial);
    await store.save(config(), initial.revision);
    await h.session.reload();
    const before = await readFile(store.path, "utf8");
    const pin = () =>
      h.session.setScopedModels(h.faux.models.map((model) => ({ model, thinkingLevel: "high" })));
    pin();
    for (const selector of [undefined, { model: BASE }, { model: BASE, effort: "high" as const }]) {
      const result = await selectModelForTask(
        request(),
        piDependencies(h.context, { ...config(), selector }, () => "high"),
      );
      assert.equal(result.reason, "selector_effort_unsupported");
      assert.ok(result.status === "selected");
      assert.equal(result.effort, "high");
    }
    h.ui.answers.push("choose", "adapter default");
    h.ui.customAnswers.push([FAST]);
    await h.session.prompt("/model-roles selector");
    assert.ok(!h.ui.selections.at(-1)?.options.includes("adapter default"));
    assert.equal(await readFile(store.path, "utf8"), before);
    h.session.setScopedModels([]);
    h.ui.answers.push("choose", "adapter default");
    h.ui.customAnswers.push([FAST]);
    h.ui.ui.confirm = async () => {
      pin();
      return true;
    };
    await h.session.prompt("/model-roles selector");
    assert.equal(await readFile(store.path, "utf8"), before);
    assert.match(h.ui.notifications.at(-1) ?? "", /no longer eligible/);
    assert.equal(h.faux.state.callCount, 0);
  } finally {
    await h.close();
  }
});
