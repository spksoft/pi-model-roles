import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { isEffort, isModelRef, isRecord, modelKey } from "../core/model-identity.js";
import type { AvailableModel, ModelRef } from "../core/types.js";
import { AUTO_SETUP_LIMITS } from "../auto-setup/limits.js";
import type {
  AutoSetupDraft,
  AutoSetupLifecycle,
  AutoSetupLifecycleEntry,
} from "../auto-setup/types.js";
import { isSafeProposalId, validateEntrySize, validateProposal } from "../auto-setup/validation.js";

export const AUTO_SETUP_ENTRY_PREFIX = "pi-model-roles:auto-setup:";
export const AUTO_SETUP_ENTRY = "pi-model-roles:auto-setup:state:v1";

function safeDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value);
}

function candidates(value: unknown): AvailableModel[] | undefined {
  if (!Array.isArray(value) || !value.length || value.length > AUTO_SETUP_LIMITS.candidates)
    return undefined;
  const result: AvailableModel[] = [];
  for (const item of value) {
    if (
      !isRecord(item) ||
      Object.keys(item).some(
        (key) => !["ref", "efforts", "images", "contextWindow"].includes(key),
      ) ||
      !isModelRef(item.ref) ||
      !Array.isArray(item.efforts) ||
      !item.efforts.length ||
      item.efforts.some((effort) => !isEffort(effort)) ||
      new Set(item.efforts).size !== item.efforts.length ||
      typeof item.images !== "boolean" ||
      typeof item.contextWindow !== "number" ||
      !Number.isSafeInteger(item.contextWindow) ||
      item.contextWindow <= 0
    )
      return undefined;
    result.push({
      ref: { ...item.ref },
      efforts: [...item.efforts],
      images: item.images,
      contextWindow: item.contextWindow,
    });
  }
  return new Set(result.map((item) => modelKey(item.ref))).size === result.length
    ? result
    : undefined;
}

function draft(value: unknown): AutoSetupDraft | undefined {
  if (!isRecord(value) || value.version !== 1) return undefined;
  if (
    !isSafeProposalId(value.requestId) ||
    typeof value.baseRevision !== "string" ||
    !value.baseRevision ||
    !isModelRef(value.researchModel) ||
    !safeDate(value.receivedAt)
  )
    return undefined;
  const available = candidates(value.candidates);
  if (!available) return undefined;
  try {
    const proposal = validateProposal(value.proposal, available);
    const saved: AutoSetupDraft = {
      version: 1,
      requestId: value.requestId,
      baseRevision: value.baseRevision,
      candidates: available,
      researchModel: { ...value.researchModel },
      receivedAt: value.receivedAt,
      proposal,
    };
    validateEntrySize(saved);
    return saved;
  } catch {
    return undefined;
  }
}

function lifecycle(value: unknown): AutoSetupLifecycleEntry | undefined {
  if (!isRecord(value) || value.version !== 1 || !isSafeProposalId(value.requestId))
    return undefined;
  if (value.state !== "ready" && value.state !== "cancelled" && value.state !== "applied")
    return undefined;
  if (Object.keys(value).some((key) => !["version", "requestId", "state", "draft"].includes(key)))
    return undefined;
  if (value.state === "ready") {
    const saved = draft(value.draft);
    if (!saved || saved.requestId !== value.requestId) return undefined;
    return { version: 1, requestId: value.requestId, state: value.state, draft: saved };
  }
  if (value.draft !== undefined) return undefined;
  return {
    version: 1,
    requestId: value.requestId,
    state: value.state as Exclude<AutoSetupLifecycle, "invalid">,
  };
}

export function appendAutoSetupEntry(
  append: <T>(type: string, data?: T) => void,
  entry: AutoSetupLifecycleEntry,
): void {
  validateEntrySize(entry);
  append(AUTO_SETUP_ENTRY, entry);
}

/**
 * The latest Auto Setup marker controls restoration. An unfamiliar or malformed
 * marker fails closed instead of reviving an earlier ready draft.
 */
export function restoreAutoSetupDraft(
  ctx: ExtensionContext,
):
  | { state: "none" }
  | { state: "ready"; draft: AutoSetupDraft }
  | { state: Exclude<AutoSetupLifecycle, "ready" | "invalid"> }
  | { state: "invalid" } {
  let last: unknown;
  let saw = false;
  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type === "custom" && entry.customType.startsWith(AUTO_SETUP_ENTRY_PREFIX)) {
      saw = true;
      last = entry.customType === AUTO_SETUP_ENTRY ? entry.data : undefined;
    }
  }
  if (!saw) return { state: "none" };
  const parsed = lifecycle(last);
  if (!parsed) return { state: "invalid" };
  if (parsed.state === "ready" && parsed.draft) return { state: "ready", draft: parsed.draft };
  if (parsed.state === "cancelled" || parsed.state === "applied") return { state: parsed.state };
  return { state: "invalid" };
}

export function sameRef(left: ModelRef | undefined, right: ModelRef | undefined): boolean {
  return left !== undefined && right !== undefined && modelKey(left) === modelKey(right);
}
