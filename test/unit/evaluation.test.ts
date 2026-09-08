import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateRouting } from "../../src/evaluation/index.js";
import { syntheticEvaluation } from "../../src/evaluation/fixtures.js";

const base = () => ({
  ...syntheticEvaluation(),
  evidence: "contract-check" as const,
  classify: async (input: { text: string }) => ({
    text: JSON.stringify(
      JSON.parse(input.text).context ? { action: "classify", matches: [] } : { matches: [] },
    ),
  }),
});

test("credential-free paired evaluation reports contract evidence, pins, baseline and no private payloads", async () => {
  const result = await evaluateRouting(base());
  assert.equal(result.stopped, "completed");
  assert.equal(result.rows.length, 48);
  assert.equal(result.evidence, "contract-check");
  assert.equal(result.executionQualityMeasured, false);
  assert.equal(result.totalExecutionCostMeasured, false);
  assert.ok(result.calls <= 32);
  assert.ok(result.rows.every((row) => !row.constraintViolation));
  assert.doesNotMatch(
    JSON.stringify(result),
    /SYNTHETIC_VISIBLE_PRIVACY_SENTINEL|Change the button|Do that one/,
  );
  assert.ok(result.metrics.some((metric) => metric.unacceptableDecisions > 0));
  assert.ok(result.rows.filter((row) => row.caseId === "explicit").every((row) => row.acceptable));
  assert.ok(
    result.rows
      .filter((row) => row.mode === "fixed")
      .every((row) => row.selectorDurationMs === undefined),
  );
});

test("adapter gets genuine text, not labels; sequence switches and supplied usage are measured", async () => {
  const input = base();
  input.cases = input.cases.slice(0, 3);
  const result = await evaluateRouting({
    ...input,
    evidence: "caller-adapter-trial",
    classify: async (request) => {
      const data = JSON.parse(request.text);
      assert.equal(data.acceptable, undefined);
      assert.equal(data.caseId, undefined);
      const matches = data.task.includes("protocol") ? [] : ["quick"];
      return {
        text: JSON.stringify(data.context ? { action: "classify", matches } : { matches }),
        usage: { input: 1, output: 2, totalTokens: 3, cost: 0.01 },
      };
    },
  });
  assert.equal(result.metrics[0]?.switches, 1);
  assert.equal(result.metrics[1]?.switches, 1);
  assert.equal(result.rows[0]?.usage?.cost, 0.01);
  assert.ok(result.rows[0]?.selectorDurationMs !== undefined);
});

test("evaluation validates all hard ceilings before any adapter call", async () => {
  let calls = 0;
  const input = {
    ...base(),
    classify: async () => {
      calls++;
      return { text: "{}" };
    },
  };
  for (const patch of [
    { maxCalls: 201 },
    { maxCalls: 1 },
    { callTimeoutMs: 60001 },
    { callTimeoutMs: 0 },
    { suiteTimeoutMs: 600001 },
    { cases: [] },
    { cases: Array.from({ length: 101 }, () => input.cases[0]!) },
    { cases: [{ ...input.cases[0]!, id: "private/path" }] },
  ])
    await assert.rejects(evaluateRouting({ ...input, ...patch }), /invalid_evaluation_input/);
  assert.equal(calls, 0);
});

test("timeouts and suite cancellation stop scheduling even if the adapter ignores abort", async () => {
  for (const suiteTimeoutMs of [1000, 5]) {
    let signal: AbortSignal | undefined;
    const result = await evaluateRouting({
      ...base(),
      callTimeoutMs: 10,
      suiteTimeoutMs,
      classify: async (input) => {
        signal = input.signal;
        return new Promise(() => {});
      },
    });
    assert.equal(result.stopped, "timeout");
    assert.equal(result.calls, 1);
    assert.equal(result.rows.length, 1);
    assert.ok(signal?.aborted);
  }
  const abort = new AbortController();
  abort.abort();
  const cancelled = await evaluateRouting({ ...base(), signal: abort.signal });
  assert.equal(cancelled.stopped, "cancelled");
  assert.equal(cancelled.calls, 0);
  const active = new AbortController();
  const inFlight = await evaluateRouting({
    ...base(),
    signal: active.signal,
    classify: async () => {
      active.abort();
      throw new Error("RAW_PRIVATE_ERROR");
    },
  });
  assert.equal(inFlight.stopped, "cancelled");
  assert.equal(inFlight.calls, 1);
  assert.doesNotMatch(JSON.stringify(inFlight), /RAW_PRIVATE_ERROR/);
});

test("configured selector deadline stops evaluation when no execution fallback can expose it", async () => {
  const input = base();
  input.config.selectorTimeoutMs = 1000;
  const selector = input.models[1]!;
  input.config.selector = { model: selector.ref };
  input.models = [selector];
  input.cases = input.cases.slice(0, 2);
  let calls = 0;
  const result = await evaluateRouting({
    ...input,
    callTimeoutMs: 5000,
    classify: async () => {
      calls++;
      return new Promise(() => {});
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.calls, 1);
  assert.equal(result.stopped, "timeout");
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0]?.reason, "selector_timeout");
  assert.equal(result.metrics[0]?.timeoutRate, 1);
});

test("evaluation rejects coercible labels and malformed records without exposing private values", async () => {
  let calls = 0;
  let coercions = 0;
  const privateLabel = {
    toString() {
      coercions++;
      return "safe";
    },
    privatePayload: "PRIVATE_EVALUATION_SENTINEL",
  };
  const input = {
    ...base(),
    classify: async () => {
      calls++;
      return { text: "{}" };
    },
  };
  const item = input.cases[0]!;
  const malformed: unknown[] = [null, true, undefined, [], "input"];
  for (const id of [privateLabel, null, true, undefined, 42])
    malformed.push({ ...input, cases: [{ ...item, id }] });
  for (const sequence of [privateLabel, null, true, 42])
    malformed.push({ ...input, cases: [{ ...item, sequence }] });
  for (const value of [null, true, {}, []]) {
    malformed.push(
      { ...input, fixed: value },
      { ...input, models: [value] },
      { ...input, cases: [value] },
      { ...input, signal: value },
      { ...input, cases: [{ ...item, request: value }] },
      { ...input, cases: [{ ...item, context: value }] },
      { ...input, cases: [{ ...item, acceptable: [value] }] },
      { ...input, cases: [{ ...item, models: [value] }] },
    );
  }
  malformed.push(
    { ...input, fixed: { model: null, effort: "high" } },
    { ...input, models: [{ ...input.models[0], efforts: [true] }] },
    { ...input, cases: [{ ...item, acceptable: [{ model: true, effort: "high" }] }] },
    { ...input, callTimeoutMs: null },
  );
  for (const candidate of malformed) {
    await assert.rejects(
      evaluateRouting(candidate as Parameters<typeof evaluateRouting>[0]),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, "invalid_evaluation_input");
        assert.doesNotMatch(JSON.stringify(error), /PRIVATE_EVALUATION_SENTINEL/);
        return true;
      },
    );
  }
  assert.equal(calls, 0);
  assert.equal(coercions, 0);
});
