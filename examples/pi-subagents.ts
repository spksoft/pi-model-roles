/** Opt-in example. Not auto-loaded or included in pi.extensions. Native Pi children only. */
import { randomUUID } from "node:crypto";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { selectViaEvents, type Effort, type ModelRef } from "pi-model-roles";
// These public event names work when pi-subagents is independently installed (no runtime import).
const REGISTER = "pi-subagents:runtime-agent-register:v1";
const REQUEST = "prompt-template:subagent:request";
const RESPONSE = "prompt-template:subagent:response";
const CANCEL = "prompt-template:subagent:cancel";
export const EXAMPLE_AGENT = "model-roles-native-example";
export interface DelegationResult {
  status: string;
  model?: string;
  thinking?: string;
}
export async function delegateExample(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  task: string,
  explicit?: { model?: ModelRef; effort?: Effort },
  signal?: AbortSignal,
): Promise<DelegationResult> {
  const current = {
    model: ctx.model ? { provider: ctx.model.provider, id: ctx.model.id } : undefined,
    effort: ctx.thinkingLevel ?? "off",
  };
  const selection = await selectViaEvents(pi.events, ctx.sessionManager.getSessionId(), {
    task,
    current,
    baseline: current,
    explicitModel: explicit?.model,
    explicitEffort: explicit?.effort,
    signal,
  });
  if (selection.status !== "selected" && selection.status !== "preserved")
    return { status: selection.status };
  if (signal?.aborted) return { status: "cancelled" };
  const identity = {
    requestId: randomUUID(),
    ownerRunId: `model-roles-${randomUUID()}`,
    nodeId: "example",
  };
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: DelegationResult) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        off();
        signal?.removeEventListener("abort", abort);
        resolve(result);
      }
    };
    const off = pi.events.on(RESPONSE, (value: unknown) => {
      if (
        !value ||
        typeof value !== "object" ||
        !("requestId" in value) ||
        value.requestId !== identity.requestId ||
        !("ownerRunId" in value) ||
        value.ownerRunId !== identity.ownerRunId ||
        !("nodeId" in value) ||
        value.nodeId !== identity.nodeId
      )
        return;
      if (!("status" in value) || typeof value.status !== "string") return;
      finish({
        status: value.status,
        model: "model" in value && typeof value.model === "string" ? value.model : undefined,
        thinking:
          "thinking" in value && typeof value.thinking === "string" ? value.thinking : undefined,
      });
    });
    const abort = () => {
      pi.events.emit(CANCEL, identity);
      finish({ status: "cancelled" });
    };
    const timer = setTimeout(() => {
      pi.events.emit(CANCEL, identity);
      finish({ status: "unavailable_or_timed_out" });
    }, 30000);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) {
      abort();
      return;
    }
    pi.events.emit(REQUEST, {
      ...identity,
      agent: EXAMPLE_AGENT,
      task,
      context: "fresh",
      cwd: ctx.cwd,
      model: `${selection.model.provider}/${selection.model.id}`,
      thinking: selection.effort,
      timeoutMs: 25000,
      artifacts: false,
      result: { kind: "text" },
    });
  });
}
export default function example(pi: ExtensionAPI): void {
  let registration: { dispose(): void } | undefined;
  const child = Boolean(process.env.PI_SUBAGENT_CHILD);
  pi.on("session_start", (_event, ctx) => {
    if (child || ctx.mode !== "tui") return;
    const request: {
      version: 1;
      name: string;
      definition: { description: string; systemPrompt: string; tools: readonly string[] };
      result?: { ok: true; registration: { dispose(): void } } | { ok: false; error: Error };
    } = {
      version: 1,
      name: EXAMPLE_AGENT,
      definition: {
        description: "Opt-in model role selection demonstration",
        systemPrompt: "Answer the given task concisely. Do not use tools.",
        tools: [],
      },
    };
    pi.events.emit(REGISTER, request);
    if (request.result?.ok) registration = request.result.registration;
    else
      ctx.ui.notify(
        "Model role example requires a compatible pi-subagents owner. No fallback launcher will be used.",
        "warning",
      );
  });
  pi.registerCommand("model-roles-delegate-example", {
    description: "Opt-in native subagent integration demo",
    async handler(task, ctx) {
      if (!registration || !task.trim()) {
        ctx.ui.notify("A compatible pi-subagents owner and nonempty task are required.", "warning");
        return;
      }
      const result = await delegateExample(pi, ctx, task, undefined, ctx.signal);
      ctx.ui.notify(`Native delegation: ${result.status}`, "info");
    },
  });
  pi.on("session_shutdown", () => {
    registration?.dispose();
    registration = undefined;
  });
}
