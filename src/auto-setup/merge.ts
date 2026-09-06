import { validateConfig } from "../config/schema.js";
import { sameModel } from "../core/model-identity.js";
import type { CustomRole, ModelRef, RoleConfig } from "../core/types.js";
import type { AutoSetupProposal, MergeChoice, MergeResult, RoleChange } from "./types.js";

function sameRole(left: RoleConfig["roles"][string], right: RoleConfig["roles"][string]): boolean {
  if (
    !sameModel(
      left.model === "inherit" ? undefined : left.model,
      right.model === "inherit" ? undefined : right.model,
    )
  )
    return false;
  if (left.effort !== right.effort) return false;
  return (
    ("description" in left ? left.description : undefined) ===
    ("description" in right ? right.description : undefined)
  );
}

function customRole(role: AutoSetupProposal["roles"][number]): CustomRole {
  return { model: { ...role.model }, effort: role.effort, description: role.description };
}

/**
 * Produces the exact candidate the user reviewed. Availability is intentionally
 * checked later only for `changedAssignments`, so unknown saved roles survive.
 */
export function mergeProposal(
  config: RoleConfig,
  proposal: AutoSetupProposal,
  choice: MergeChoice,
): MergeResult {
  const next = structuredClone(config);
  const existingCustomIds = Object.keys(next.roles).filter((id) => id !== "default");
  const replacementIds = new Set(choice.replaceIds ?? []);
  const changes: RoleChange[] = [];
  const changedAssignments: Array<{ model: ModelRef; effort: CustomRole["effort"] }> = [];

  if (proposal.default && choice.replaceDefault) {
    const replacement = { model: { ...proposal.default.model }, effort: proposal.default.effort };
    if (!sameRole(next.roles.default, replacement)) {
      next.roles.default = replacement;
      changes.push({ id: "default", kind: "replace" });
      changedAssignments.push({ model: replacement.model, effort: replacement.effort });
    } else {
      changes.push({ id: "default", kind: "unchanged" });
    }
  } else if (proposal.default) {
    changes.push({ id: "default", kind: "unchanged" });
  }

  if (choice.mode === "replace-custom") {
    for (const id of existingCustomIds) {
      delete next.roles[id];
      changes.push({ id, kind: "delete" });
    }
  }

  for (const proposed of proposal.roles) {
    const existing = next.roles[proposed.id];
    const canReplace =
      choice.mode === "replace-custom" ||
      (choice.mode === "replace-selected" && replacementIds.has(proposed.id));
    if (existing && proposed.id !== "default" && !canReplace) {
      changes.push({ id: proposed.id, kind: "unchanged" });
      continue;
    }
    const replacement = customRole(proposed);
    if (!existing) {
      next.roles[proposed.id] = replacement;
      changes.push({ id: proposed.id, kind: "add" });
      changedAssignments.push({ model: replacement.model, effort: replacement.effort });
      continue;
    }
    if (sameRole(existing, replacement)) {
      changes.push({ id: proposed.id, kind: "unchanged" });
      continue;
    }
    next.roles[proposed.id] = replacement;
    changes.push({ id: proposed.id, kind: "replace" });
    changedAssignments.push({ model: replacement.model, effort: replacement.effort });
  }

  const validated = validateConfig(next);
  const addsCustomRole = changes.some((change) => change.kind === "add" && change.id !== "default");
  return {
    config: validated,
    changes: changes.sort((a, b) => a.id.localeCompare(b.id)),
    changedAssignments,
    addsCustomRole,
  };
}
