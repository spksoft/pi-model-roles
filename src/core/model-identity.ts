import { LIMITS } from "./defaults.js";
import { EFFORTS, type Effort, type ModelRef } from "./types.js";
export function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  );
}
export function isEffort(value: unknown): value is Effort {
  return EFFORTS.some((effort) => effort === value);
}
export function isModelRef(value: unknown): value is ModelRef {
  return (
    isRecord(value) &&
    Object.keys(value).length === 2 &&
    [value.provider, value.id].every(
      (field) =>
        typeof field === "string" &&
        field.trim() === field &&
        field.length > 0 &&
        field.length <= LIMITS.modelField &&
        Array.from(field).every((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127),
    )
  );
}
export function modelKey(model: ModelRef): string {
  return JSON.stringify([model.provider, model.id]);
}
export function sameModel(a: ModelRef | undefined, b: ModelRef | undefined): boolean {
  return a === undefined
    ? b === undefined
    : b !== undefined && a.provider === b.provider && a.id === b.id;
}
export function displayModel(model: ModelRef | undefined): string {
  return model ? `${model.provider}/${model.id}` : "none";
}
