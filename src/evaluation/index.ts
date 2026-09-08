import { validateConfig } from "../config/schema.js";
import { bounded, DeadlineError } from "../core/async.js";
import { isEffort, isModelRef, isRecord, sameModel } from "../core/model-identity.js";
import { validRoutingContext } from "../core/routing-context.js";
import {
  selectModelForTask,
  selectModelWithContext,
  unavailable,
  validRequest,
} from "../core/selection.js";
import type {
  AvailableModel,
  ClassifierInput,
  ClassifierOutput,
  ModelState,
  RoleConfig,
  RoutingContext,
  SelectionDecision,
  SelectionRequest,
  SelectorUsage,
} from "../core/types.js";

export const EVALUATION_LIMITS = Object.freeze({
  cases: 100,
  calls: 200,
  concurrency: 1,
  callTimeoutMs: 60000,
  suiteTimeoutMs: 600000,
});
export interface EvaluationCase {
  /** Reviewed synthetic identifier, never a task or path. */
  id: string;
  sequence?: string;
  request: SelectionRequest;
  context: RoutingContext;
  /** Empty means an unavailable decision is expected; cancelled is never agreement. */
  acceptable: Array<Required<ModelState>>;
  /** Optional synthetic availability change. */
  models?: readonly AvailableModel[];
}
export interface EvaluationInput {
  cases: readonly EvaluationCase[];
  config: RoleConfig;
  models: readonly AvailableModel[];
  fixed: Required<ModelState>;
  /** Explicit adapter only. No provider loading or credentials are discovered. */
  classify(input: ClassifierInput): Promise<ClassifierOutput>;
  evidence: "contract-check" | "caller-adapter-trial";
  maxCalls?: number;
  callTimeoutMs?: number;
  suiteTimeoutMs?: number;
  signal?: AbortSignal;
}
export interface EvaluationRow {
  caseId: string;
  mode: "prompt" | "conversation" | "fixed";
  status: SelectionDecision["status"];
  reason: SelectionDecision["reason"];
  acceptable: boolean;
  fallback: boolean;
  /** Compared only with the prior executable decision in the same labelled sequence/mode. */
  switched: boolean;
  /** Scope, image, or explicit/manual pair violation; not a claim of observed harm. */
  constraintViolation: boolean;
  selectorDurationMs?: number;
  usage?: SelectorUsage;
}
function executable(
  decision: SelectionDecision,
): decision is Extract<SelectionDecision, { status: "selected" | "preserved" }> {
  return decision.status === "selected" || decision.status === "preserved";
}
function samePair(left: ModelState, right: ModelState): boolean {
  return sameModel(left.model, right.model) && left.effort === right.effort;
}
function positive(value: number, max: number): boolean {
  return Number.isInteger(value) && value > 0 && value <= max;
}
function validModels(models: unknown): boolean {
  return (
    Array.isArray(models) &&
    models.length <= 10000 &&
    models.every(
      (model) =>
        isRecord(model) &&
        isModelRef(model.ref) &&
        Array.isArray(model.efforts) &&
        model.efforts.length > 0 &&
        model.efforts.every(isEffort) &&
        typeof model.images === "boolean" &&
        typeof model.contextWindow === "number" &&
        Number.isFinite(model.contextWindow) &&
        model.contextWindow > 0,
    )
  );
}
/** Sequential paired selector evaluation. Never executes tasks or prints input/provider errors. */
export async function evaluateRouting(input: EvaluationInput) {
  if (!isRecord(input)) throw new Error("invalid_evaluation_input");
  const maxCalls = input.maxCalls === undefined ? EVALUATION_LIMITS.calls : input.maxCalls;
  const callTimeoutMs = input.callTimeoutMs === undefined ? 8000 : input.callTimeoutMs;
  const suiteTimeoutMs =
    input.suiteTimeoutMs === undefined ? EVALUATION_LIMITS.suiteTimeoutMs : input.suiteTimeoutMs;
  const label = /^[a-z][a-z0-9_-]{0,47}$/;
  if (
    !Array.isArray(input.cases) ||
    !positive(input.cases.length, EVALUATION_LIMITS.cases) ||
    !positive(maxCalls, EVALUATION_LIMITS.calls) ||
    input.cases.length * 2 > maxCalls ||
    !positive(callTimeoutMs, EVALUATION_LIMITS.callTimeoutMs) ||
    !positive(suiteTimeoutMs, EVALUATION_LIMITS.suiteTimeoutMs) ||
    !["contract-check", "caller-adapter-trial"].includes(input.evidence) ||
    typeof input.classify !== "function" ||
    (input.signal !== undefined && !(input.signal instanceof AbortSignal)) ||
    !isRecord(input.fixed) ||
    !isModelRef(input.fixed.model) ||
    !isEffort(input.fixed.effort) ||
    !validModels(input.models) ||
    input.cases.some(
      (item) =>
        !isRecord(item) ||
        typeof item.id !== "string" ||
        !label.test(item.id) ||
        (item.sequence !== undefined &&
          (typeof item.sequence !== "string" || !label.test(item.sequence))) ||
        !validRequest(item.request) ||
        !validRoutingContext(item.context) ||
        (item.models !== undefined && !validModels(item.models)) ||
        !Array.isArray(item.acceptable) ||
        item.acceptable.length > 32 ||
        item.acceptable.some(
          (pair: unknown) => !isRecord(pair) || !isModelRef(pair.model) || !isEffort(pair.effort),
        ),
    ) ||
    new Set(input.cases.map((item) => item.id)).size !== input.cases.length
  )
    throw new Error("invalid_evaluation_input");
  let config: RoleConfig;
  try {
    config = validateConfig(input.config);
  } catch {
    throw new Error("invalid_evaluation_config");
  }
  const rows: EvaluationRow[] = [];
  const previous = new Map<string, SelectionDecision>();
  let calls = 0;
  let stopped: "completed" | "timeout" | "cancelled" = "completed";
  const deadline = Date.now() + suiteTimeoutMs;
  const cases: readonly EvaluationCase[] = input.cases;
  outer: for (const item of cases)
    for (const mode of ["prompt", "conversation", "fixed"] as const) {
      if (input.signal?.aborted) {
        stopped = "cancelled";
        break outer;
      }
      if (Date.now() >= deadline) {
        stopped = "timeout";
        break outer;
      }
      const key = item.sequence ? `${item.sequence}:${mode}` : undefined;
      const prior = key ? previous.get(key) : undefined;
      const request = { ...item.request };
      if (
        prior &&
        executable(prior) &&
        !request.paused &&
        !request.explicitModel &&
        !request.explicitEffort
      )
        request.current = { model: prior.model, effort: prior.effort };
      const models = item.models ?? input.models;
      let selectorStart: number | undefined;
      const dependencies = {
        config,
        models: () => models,
        classify: async (classifier: ClassifierInput) => {
          if (++calls > maxCalls) throw new Error("evaluation_call_limit");
          selectorStart = Date.now();
          return input.classify(classifier);
        },
      };
      let decision: SelectionDecision;
      try {
        decision = await bounded(
          async (signal) => {
            const combined = AbortSignal.any([signal, ...(request.signal ? [request.signal] : [])]);
            const resolved = { ...request, signal: combined };
            if (mode === "fixed")
              return selectModelForTask(
                resolved.explicitModel ||
                  resolved.explicitEffort ||
                  resolved.paused ||
                  resolved.requestedRole ||
                  !config.enabled
                  ? resolved
                  : {
                      ...resolved,
                      explicitModel: input.fixed.model,
                      explicitEffort: input.fixed.effort,
                    },
                dependencies,
              );
            if (mode === "prompt") return selectModelForTask(resolved, dependencies);
            const context = structuredClone(item.context);
            if (key) {
              delete context.previousRole;
              if (prior && executable(prior) && prior.role) context.previousRole = prior.role;
            }
            return selectModelWithContext(resolved, dependencies, context);
          },
          // Registered before core selection: an inner timeout may be hidden by unavailable fallback.
          Math.min(callTimeoutMs, config.selectorTimeoutMs, Math.max(1, deadline - Date.now())),
          input.signal,
        );
      } catch (error) {
        decision = unavailable(
          error instanceof DeadlineError ? "selector_timeout" : "cancelled",
          !(error instanceof DeadlineError),
        );
      }
      const usable = executable(decision) ? decision : undefined;
      const model = usable ? models.find((entry) => sameModel(entry.ref, usable.model)) : undefined;
      const pin =
        request.explicitModel ??
        (request.paused || !config.enabled ? request.current.model : undefined);
      const pinnedEffort =
        request.explicitEffort ??
        (request.paused || !config.enabled ? request.current.effort : undefined);
      rows.push({
        caseId: item.id,
        mode,
        status: decision.status,
        reason: decision.reason,
        fallback: decision.fallback,
        acceptable: usable
          ? item.acceptable.some((pair) => samePair(pair, usable))
          : decision.status === "unavailable" && item.acceptable.length === 0,
        switched: usable ? Boolean(prior && executable(prior) && !samePair(prior, usable)) : false,
        constraintViolation: usable
          ? !model ||
            !model.efforts.includes(usable.effort) ||
            Boolean(request.requiresImages && !model.images) ||
            Boolean(
              request.allowedModels &&
                !request.allowedModels.some((ref) => sameModel(ref, usable.model)),
            ) ||
            Boolean(pin && !sameModel(pin, usable.model)) ||
            Boolean(pinnedEffort && pinnedEffort !== usable.effort)
          : false,
        ...(decision.selector
          ? {
              selectorDurationMs: decision.selector.durationMs,
              ...(decision.selector.usage ? { usage: decision.selector.usage } : {}),
            }
          : selectorStart === undefined
            ? {}
            : { selectorDurationMs: Math.max(0, Date.now() - selectorStart) }),
      });
      if (key && usable) previous.set(key, decision);
      if (decision.reason === "selector_timeout" || decision.status === "cancelled") {
        stopped = decision.reason === "selector_timeout" ? "timeout" : "cancelled";
        break outer; // Never schedule replacements for potentially uncooperative timed-out work.
      }
    }
  const metrics = (["prompt", "conversation", "fixed"] as const).map((mode) => {
    const selected = rows.filter((row) => row.mode === mode);
    const count = selected.length;
    const rate = (predicate: (row: EvaluationRow) => boolean) =>
      count ? selected.filter(predicate).length / count : null;
    return {
      mode,
      cases: count,
      acceptableAgreement: rate((row) => row.acceptable),
      fallbackRate: rate((row) => row.fallback),
      timeoutRate: rate((row) => row.reason === "selector_timeout"),
      cancellationRate: rate((row) => row.status === "cancelled"),
      switches: selected.filter((row) => row.switched).length,
      constraintViolations: selected.filter((row) => row.constraintViolation).length,
      unacceptableDecisions: selected.filter((row) => !row.acceptable).length,
    };
  });
  return {
    version: 1 as const,
    evidence: input.evidence,
    selectorOnly: true,
    executionQualityMeasured: false,
    totalExecutionCostMeasured: false,
    stopped,
    calls,
    concurrency: 1,
    rows,
    metrics,
  };
}
