import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { ROLE_ID } from "../core/defaults.js";
import { isEffort, isModelRef, isRecord, sameModel } from "../core/model-identity.js";
import type { ModelState } from "../core/types.js";
export const STATE_ENTRY = "pi-model-roles:state:v1";
export const DECISION_ENTRY = "pi-model-roles:decision:v1";
export interface SavedState {
  version: 1;
  mode: "auto" | "manual";
  baseline: ModelState;
  actual: ModelState;
  role?: string;
}
function safePair(value: unknown): value is ModelState {
  return (
    isRecord(value) &&
    isEffort(value.effort) &&
    (value.model === undefined || isModelRef(value.model))
  );
}
export function sameState(a: ModelState, b: ModelState): boolean {
  return sameModel(a.model, b.model) && a.effort === b.effort;
}
export function restoreState(
  ctx: ExtensionContext,
  actual: ModelState,
  startup: ModelState,
): SavedState | undefined {
  let value: unknown;
  for (const entry of ctx.sessionManager.getBranch())
    if (entry.type === "custom" && entry.customType === STATE_ENTRY) value = entry.data;
  if (value === undefined) return undefined;
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !safePair(value.baseline) ||
    !safePair(value.actual) ||
    !["auto", "manual"].includes(String(value.mode))
  )
    return { version: 1, mode: "manual", baseline: startup, actual };
  return {
    version: 1,
    mode: value.mode === "manual" || !sameState(actual, value.actual) ? "manual" : "auto",
    baseline: structuredClone(value.baseline),
    actual,
    ...(typeof value.role === "string" && ROLE_ID.test(value.role) ? { role: value.role } : {}),
  };
}
export function historyRequiresImages(ctx: ExtensionContext): boolean {
  // Walk only retained context entries; inspect content shape, never serialize or forward it.
  function image(value: unknown): boolean {
    if (Array.isArray(value)) return value.some(image);
    if (!value || typeof value !== "object") return false;
    if ("type" in value && value.type === "image") return true;
    if ("content" in value) return image(value.content);
    if ("message" in value) return image(value.message);
    if ("retainedTail" in value) return image(value.retainedTail);
    return false;
  }
  return ctx.sessionManager.buildContextEntries().some(image);
}
