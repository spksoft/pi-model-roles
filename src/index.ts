/** Side-effect-free API: importing this module does not register a Pi extension. */
export { defaultConfig } from "./core/defaults.js";
export { selectModelForTask, selectModelWithContext } from "./core/selection.js";
export { EFFORTS, REASONS } from "./core/types.js";
export type {
  AvailableModel,
  ClassifierInput,
  ClassifierOutput,
  CustomRole,
  DefaultRole,
  Effort,
  ModelRef,
  ModelState,
  Reason,
  RoleConfig,
  RoutingContext,
  RoutingMetadata,
  SelectionDecision,
  SelectionDependencies,
  SelectionRequest,
  SelectorMetadata,
  SelectorUsage,
  Warning,
} from "./core/types.js";
export { SELECT_EVENT, registerSelectionService, selectViaEvents } from "./api/events.js";
export type { SelectionEvent, SelectionEventBus } from "./api/events.js";
export {
  PI_SUBAGENT_ROUTING_UNSUPPORTED,
  createPiSubagentsBackgroundBridge,
  piSubagentRoutingDiagnostic,
} from "./integrations/pi-subagents.js";
export type {
  PiSubagentRoutingDiagnostic,
  PiSubagentRoutingRequest,
} from "./integrations/pi-subagents.js";
