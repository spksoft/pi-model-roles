import {
  selectModelForTask,
  type SelectionDecision,
  type Effort,
  type SelectionDependencies,
  type SelectionRequest,
} from "pi-model-roles";
/** Call only after the host has resolved its own explicit run/agent pins and model restrictions. */
export async function chooseForChild(
  request: SelectionRequest,
  dependencies: SelectionDependencies,
): Promise<{ decision: SelectionDecision; model?: string; thinking?: Effort }> {
  const decision = await selectModelForTask(request, dependencies);
  if (decision.status !== "selected" && decision.status !== "preserved") return { decision };
  // The host still owns launch preflight, context, permissions, cancellation, and execution.
  return {
    decision,
    model: `${decision.model.provider}/${decision.model.id}`,
    thinking: decision.effort,
  };
}
