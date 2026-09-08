import { validateConfig } from "../config/schema.js";
import { bounded, DeadlineError } from "./async.js";
import {
  CLASSIFIER_PROMPT,
  CONTEXT_CLASSIFIER_PROMPT,
  classifierText,
  parseContextMatch,
  parseMatches,
} from "./classifier-protocol.js";
import { routingMetadata, validRoutingContext } from "./routing-context.js";
import { LIMITS, RESERVED_IDS, ROLE_ID, charLength } from "./defaults.js";
import { isEffort, isModelRef, isRecord, modelKey, sameModel } from "./model-identity.js";
import {
  EFFORTS,
  type AvailableModel,
  type Effort,
  type ModelRef,
  type ModelState,
  type Reason,
  type RoutingContext,
  type SelectionDecision,
  type SelectionDependencies,
  type SelectionRequest,
  type SelectorMetadata,
} from "./types.js";
export function unavailable(reason: Reason, cancelled = false): SelectionDecision {
  return { status: cancelled ? "cancelled" : "unavailable", reason, fallback: false, warnings: [] };
}
function stateValid(value: unknown): value is ModelState {
  return (
    isRecord(value) &&
    isEffort(value.effort) &&
    (value.model === undefined || isModelRef(value.model))
  );
}
export function validRequest(value: unknown): value is SelectionRequest {
  if (
    !isRecord(value) ||
    typeof value.task !== "string" ||
    !stateValid(value.current) ||
    !stateValid(value.baseline)
  )
    return false;
  const allowed = [
    "task",
    "current",
    "baseline",
    "explicitModel",
    "explicitEffort",
    "requestedRole",
    "paused",
    "allowedModels",
    "requiresImages",
    "signal",
  ];
  if (Object.keys(value).some((key) => !allowed.includes(key))) return false;
  if (value.explicitModel !== undefined && !isModelRef(value.explicitModel)) return false;
  if (value.explicitEffort !== undefined && !isEffort(value.explicitEffort)) return false;
  if (
    value.requestedRole !== undefined &&
    (typeof value.requestedRole !== "string" ||
      !ROLE_ID.test(value.requestedRole) ||
      RESERVED_IDS.has(value.requestedRole))
  )
    return false;
  if (
    [value.paused, value.requiresImages].some(
      (field) => field !== undefined && typeof field !== "boolean",
    )
  )
    return false;
  if (
    value.allowedModels !== undefined &&
    (!Array.isArray(value.allowedModels) ||
      value.allowedModels.length > 10000 ||
      !value.allowedModels.every(isModelRef))
  )
    return false;
  if (value.signal !== undefined && !(value.signal instanceof AbortSignal)) return false;
  return true;
}
function eligible(
  request: SelectionRequest,
  deps: SelectionDependencies,
  model: ModelRef | undefined,
): AvailableModel | undefined {
  if (
    !model ||
    (request.allowedModels !== undefined &&
      !request.allowedModels.some((allowed) => sameModel(model, allowed)))
  )
    return undefined;
  return deps
    .models()
    .find(
      (item) =>
        sameModel(item.ref, model) &&
        item.efforts.length > 0 &&
        (!request.requiresImages || item.images),
    );
}
function normalizeEffort(model: AvailableModel, effort: Effort): Effort {
  if (model.efforts.includes(effort)) return effort;
  // Match Pi's clampThinkingLevel: prefer the next supported higher level, then lower.
  return (
    EFFORTS.find(
      (level) => EFFORTS.indexOf(level) >= EFFORTS.indexOf(effort) && model.efforts.includes(level),
    ) ??
    [...EFFORTS]
      .reverse()
      .find(
        (level) =>
          EFFORTS.indexOf(level) <= EFFORTS.indexOf(effort) && model.efforts.includes(level),
      ) ??
    model.efforts[0] ??
    "off"
  );
}
function selected(
  request: SelectionRequest,
  deps: SelectionDependencies,
  state: ModelState,
  reason: Reason,
  role?: string,
  fallback = false,
): SelectionDecision | undefined {
  const model = eligible(request, deps, state.model);
  if (!model) return undefined;
  const effort = normalizeEffort(model, state.effort);
  return {
    status: "selected",
    model: { ...model.ref },
    effort,
    requestedEffort: state.effort,
    role,
    reason,
    fallback,
    warnings: effort === state.effort ? [] : ["effort_clamped"],
  };
}
export function roleState(
  id: string,
  request: SelectionRequest,
  deps: SelectionDependencies,
): ModelState | undefined {
  const role = deps.config.roles[id];
  if (!role || !Object.hasOwn(deps.config.roles, id)) return undefined;
  const model = role.model === "inherit" ? request.baseline.model : role.model;
  const effort =
    role.effort === "inherit"
      ? model
        ? (deps.defaultEffort?.(model) ?? request.baseline.effort)
        : request.baseline.effort
      : role.effort;
  return { model, effort };
}
export function fallbackDecision(
  request: SelectionRequest,
  deps: SelectionDependencies,
  reason: Reason,
  fallback = true,
): SelectionDecision {
  const candidates = [roleState("default", request, deps), request.baseline, request.current];
  const seen = new Set<string>();
  for (const [index, candidate] of candidates.entries()) {
    if (!candidate?.model) continue;
    const key = modelKey(candidate.model);
    if (seen.has(key)) continue;
    seen.add(key);
    const result = selected(
      request,
      deps,
      candidate,
      reason,
      index === 0 ? "default" : undefined,
      fallback || index > 0,
    );
    if (result) {
      if (index > 0) result.warnings.push("default_unavailable");
      return result;
    }
  }
  return unavailable("no_usable_model");
}
function preserved(
  request: SelectionRequest,
  deps: SelectionDependencies,
  reason: Reason,
): SelectionDecision {
  const model = request.explicitModel ?? request.current.model;
  const effort = request.explicitEffort ?? request.current.effort;
  const match = eligible(request, deps, model);
  if (!match || (request.explicitEffort !== undefined && !match.efforts.includes(effort)))
    return unavailable("invalid_explicit");
  const result = selected(request, deps, { model, effort }, reason);
  return result?.status === "selected"
    ? { ...result, status: "preserved" }
    : unavailable("invalid_explicit");
}
function continuationDecision(
  request: SelectionRequest,
  deps: SelectionDependencies,
  context?: RoutingContext,
): SelectionDecision | undefined {
  if (!context?.messages.length || !context.previousRole) return undefined;
  const state = roleState(context.previousRole, request, deps);
  const decision = state && selected(request, deps, state, "continued", context.previousRole);
  return decision?.status === "selected" &&
    sameModel(decision.model, request.current.model) &&
    decision.effort === request.current.effort
    ? decision
    : undefined;
}

async function autoSelect(
  request: SelectionRequest,
  deps: SelectionDependencies,
  context?: RoutingContext,
): Promise<SelectionDecision> {
  const ids = Object.keys(deps.config.roles).filter((id) => id !== "default");
  const candidates = ids.filter((id) =>
    eligible(request, deps, roleState(id, request, deps)?.model),
  );
  const finish = (result: SelectionDecision): SelectionDecision => {
    if (candidates.length < ids.length) result.warnings.push("roles_unavailable");
    if (context) result.routing = routingMetadata(context);
    return result;
  };
  if (!candidates.length) return finish(fallbackDecision(request, deps, "default_only", false));
  if (!request.task.trim()) return finish(fallbackDecision(request, deps, "insufficient_text"));
  if (charLength(request.task) > LIMITS.task)
    return finish(fallbackDecision(request, deps, "input_too_large"));
  // Selector need not see images, but must respect the caller's model restriction.
  const selector = eligible(
    { ...request, requiresImages: false },
    deps,
    roleState("default", request, deps)?.model,
  );
  if (!selector) return finish(fallbackDecision(request, deps, "selector_unavailable"));
  if (context && !continuationDecision(request, deps, context)) delete context.previousRole;
  const systemPrompt = context ? CONTEXT_CLASSIFIER_PROMPT : CLASSIFIER_PROMPT;
  let text = classifierText(request.task, deps.config.roles, candidates, context);
  // Remove oldest optional history to fit. Never shorten the task or role descriptions.
  const fits = () =>
    Buffer.byteLength(text + systemPrompt) + LIMITS.outputTokens + 1024 <= selector.contextWindow;
  while (!fits() && context?.messages.length) {
    context.messages.shift();
    context.truncated = true;
    if (!context.messages.length) delete context.previousRole;
    text = classifierText(request.task, deps.config.roles, candidates, context);
  }
  if (!fits()) return finish(fallbackDecision(request, deps, "context_budget"));
  const start = (deps.now ?? Date.now)();
  let metadata: SelectorMetadata = { model: { ...selector.ref }, durationMs: 0 };
  let result: SelectionDecision;
  try {
    const response = await bounded(
      (signal) =>
        deps.classify({
          model: selector.ref,
          systemPrompt,
          text,
          signal,
          maxTokens: LIMITS.outputTokens,
        }),
      deps.config.selectorTimeoutMs,
      request.signal,
    );
    const contextualMatch = context ? parseContextMatch(response.text, candidates) : undefined;
    const matches = context ? contextualMatch?.matches : parseMatches(response.text, candidates);
    if (
      response.usage &&
      [
        response.usage.input,
        response.usage.output,
        response.usage.totalTokens,
        response.usage.cost,
      ].every((n) => Number.isFinite(n) && n >= 0)
    )
      metadata = {
        ...metadata,
        usage: {
          input: response.usage.input,
          output: response.usage.output,
          totalTokens: response.usage.totalTokens,
          cost: response.usage.cost,
        },
      };
    if (contextualMatch?.action === "continue") {
      result =
        continuationDecision(request, deps, context) ??
        fallbackDecision(request, deps, "invalid_response");
    } else if (matches?.length === 1) {
      const id = matches[0] as string;
      const state = roleState(id, request, deps);
      result =
        (state && selected(request, deps, state, "matched", id)) ||
        fallbackDecision(request, deps, "role_unavailable");
    } else
      result = fallbackDecision(
        request,
        deps,
        matches === undefined
          ? "invalid_response"
          : matches.length === 0
            ? "no_match"
            : "ambiguous",
      );
  } catch (error) {
    if (request.signal?.aborted) return unavailable("cancelled", true);
    result = fallbackDecision(
      request,
      deps,
      error instanceof DeadlineError ? "selector_timeout" : "selector_failed",
    );
  }
  metadata.durationMs = Math.max(0, (deps.now ?? Date.now)() - start);
  result.selector = metadata;
  return finish(result);
}
/** Selects only: no filesystem writes, active-model mutation, agent execution, or credential discovery. */
export function selectModelForTask(
  request: SelectionRequest,
  dependencies: SelectionDependencies,
): Promise<SelectionDecision> {
  return select(request, dependencies);
}

/** Opt-in direct API. The caller owns consent/projection; no implicit session history access. */
export function selectModelWithContext(
  request: SelectionRequest,
  dependencies: SelectionDependencies,
  context: RoutingContext,
): Promise<SelectionDecision> {
  if (!validRoutingContext(context)) return Promise.resolve(unavailable("invalid_request"));
  return select(request, dependencies, structuredClone(context));
}

async function select(
  request: SelectionRequest,
  dependencies: SelectionDependencies,
  context?: RoutingContext,
): Promise<SelectionDecision> {
  if (!validRequest(request)) return unavailable("invalid_request");
  if (request.signal?.aborted) return unavailable("cancelled", true);
  let deps: SelectionDependencies;
  try {
    deps = { ...dependencies, config: validateConfig(dependencies.config) };
  } catch {
    return unavailable("config_invalid");
  }
  try {
    if (request.explicitModel || request.explicitEffort)
      return preserved(request, deps, "explicit");
    if (request.paused) return preserved(request, deps, "manual");
    if (request.requestedRole) {
      const state = roleState(request.requestedRole, request, deps);
      return (
        (state && selected(request, deps, state, "requested_role", request.requestedRole)) ||
        fallbackDecision(request, deps, "role_unavailable")
      );
    }
    if (!deps.config.enabled) return preserved(request, deps, "disabled");
    return await autoSelect(request, deps, context);
  } catch {
    return unavailable("no_usable_model");
  }
}
