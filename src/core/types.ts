export const EFFORTS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORTS)[number];
export interface ModelRef {
  provider: string;
  id: string;
}
export interface ModelState {
  model?: ModelRef;
  effort: Effort;
}
export interface DefaultRole {
  model: ModelRef | "inherit";
  effort: Effort | "inherit";
}
export interface CustomRole {
  model: ModelRef;
  effort: Effort;
  description: string;
}
export interface RoleConfig {
  version: 1;
  enabled: boolean;
  selectorTimeoutMs: number;
  /** Idle-TUI routing data policy; omitted means prompt. Library v1 calls stay prompt-only. */
  selectorContext?: "prompt" | "conversation";
  roles: { default: DefaultRole } & Record<string, DefaultRole | CustomRole>;
}
export interface AvailableModel {
  ref: ModelRef;
  efforts: readonly Effort[];
  contextWindow: number;
  images: boolean;
}
export const REASONS = [
  "explicit",
  "manual",
  "disabled",
  "requested_role",
  "default_only",
  "matched",
  "continued",
  "no_match",
  "ambiguous",
  "invalid_response",
  "selector_failed",
  "selector_timeout",
  "selector_unavailable",
  "input_too_large",
  "insufficient_text",
  "context_budget",
  "role_unavailable",
  "no_usable_model",
  "invalid_explicit",
  "cancelled",
  "invalid_request",
  "config_invalid",
  "apply_failed",
  "stale",
] as const;
export type Reason = (typeof REASONS)[number];
export type Warning = "effort_clamped" | "roles_unavailable" | "default_unavailable";
export interface SelectorUsage {
  input: number;
  output: number;
  totalTokens: number;
  cost: number;
}
export interface SelectorMetadata {
  model: ModelRef;
  durationMs: number;
  usage?: SelectorUsage;
}
export interface RoutingContext {
  version: 1;
  messages: Array<{ kind: "user" | "assistant" | "summary"; text: string }>;
  truncated: boolean;
  previousRole?: string;
}
/** Non-content receipt only: safe to persist without copying conversation text. */
export interface RoutingMetadata {
  mode: "prompt" | "conversation";
  messages: number;
  historyBytes: number;
  truncated: boolean;
}
interface DecisionBase {
  routing?: RoutingMetadata;
  reason: Reason;
  fallback: boolean;
  warnings: Warning[];
  selector?: SelectorMetadata;
}
export type SelectionDecision = DecisionBase &
  (
    | {
        status: "selected" | "preserved";
        model: ModelRef;
        effort: Effort;
        requestedEffort: Effort;
        role?: string;
      }
    | { status: "unavailable" | "cancelled" }
  );
export interface SelectionRequest {
  task: string;
  current: ModelState;
  baseline: ModelState;
  explicitModel?: ModelRef;
  explicitEffort?: Effort;
  requestedRole?: string;
  paused?: boolean;
  allowedModels?: readonly ModelRef[];
  requiresImages?: boolean;
  signal?: AbortSignal;
}
export interface ClassifierInput {
  model: ModelRef;
  systemPrompt: string;
  text: string;
  signal: AbortSignal;
  maxTokens: number;
}
export interface ClassifierOutput {
  text: string;
  usage?: SelectorUsage;
}
export interface SelectionDependencies {
  config: RoleConfig;
  /** Cached, synchronous snapshot; refreshed for final validation, never a network probe. */
  models(): readonly AvailableModel[];
  classify(input: ClassifierInput): Promise<ClassifierOutput>;
  defaultEffort?(model: ModelRef): Effort;
  now?: () => number;
}
