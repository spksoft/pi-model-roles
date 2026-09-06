import type { AvailableModel, CustomRole, Effort, ModelRef, RoleConfig } from "../core/types.js";

export type EvidenceStatus =
  | "official_sources_cited"
  | "no_official_evidence_found"
  | "offline_knowledge"
  | "identity_unresolved";

export interface EvidenceSource {
  title: string;
  url: string;
  /** Date the agent reports it accessed the source (YYYY-MM-DD). */
  accessedAt: string;
  /** Source publication date when known (YYYY-MM-DD). */
  publishedAt?: string;
  benchmark?: string;
  result?: string;
  metric?: string;
  harness?: string;
  split?: string;
  version?: string;
}

export interface UpstreamIdentity {
  provider: string;
  id: string;
  /** Index into this assessment's sources that documents the mapping. */
  mappingSource: number;
}

export interface ModelAssessment {
  model: ModelRef;
  status: EvidenceStatus;
  summary: string;
  sources: EvidenceSource[];
  caveats: string[];
  /** Optional documented mapping from the serving registry model to an upstream model. */
  upstream?: UpstreamIdentity;
}

export interface RoleRecommendation extends CustomRole {
  id: string;
  rationale: string;
  effortRationale: string;
  /** Selected candidate refs used as the recommendation's evidence basis. */
  evidenceModels: ModelRef[];
  uncertainty: string;
  /** A trade-off against another selected model when one is relevant. */
  tradeoff?: string;
}

export interface DefaultRecommendation {
  model: ModelRef;
  effort: Effort;
  rationale: string;
  effortRationale: string;
  evidenceModels: ModelRef[];
  uncertainty: string;
  tradeoff?: string;
}

/** Agent-provided data only. Request identity and receipt timestamps are trusted coordinator data. */
export interface AutoSetupProposal {
  version: 1;
  summary: string;
  assessments: ModelAssessment[];
  roles: RoleRecommendation[];
  default?: DefaultRecommendation;
}

export interface AutoSetupDraft {
  version: 1;
  requestId: string;
  baseRevision: string;
  candidates: AvailableModel[];
  researchModel: ModelRef;
  receivedAt: string;
  proposal: AutoSetupProposal;
}

export type AutoSetupLifecycle = "ready" | "cancelled" | "applied" | "invalid";

export interface AutoSetupLifecycleEntry {
  version: 1;
  requestId: string;
  state: AutoSetupLifecycle;
  draft?: AutoSetupDraft;
}

export type MergeMode = "keep" | "replace-selected" | "replace-custom";

export interface MergeChoice {
  mode: MergeMode;
  replaceIds?: readonly string[];
  replaceDefault?: boolean;
}

export type RoleChangeKind = "add" | "replace" | "delete" | "unchanged";

export interface RoleChange {
  id: string;
  kind: RoleChangeKind;
}

export interface MergeResult {
  config: RoleConfig;
  changes: RoleChange[];
  /** Only these assignments need a fresh availability/effort check before saving. */
  changedAssignments: Array<{ model: ModelRef; effort: Effort }>;
  addsCustomRole: boolean;
}
