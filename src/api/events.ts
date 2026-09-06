import { isRecord } from "../core/model-identity.js";
import { unavailable, validRequest } from "../core/selection.js";
import type { SelectionDecision, SelectionRequest } from "../core/types.js";
export const SELECT_EVENT = "pi-model-roles:select:v1";
export interface SelectionEvent {
  version: 1;
  sessionId: string;
  request: SelectionRequest;
  result?: Promise<SelectionDecision>;
}
export interface SelectionEventBus {
  on(event: string, handler: (data: unknown) => void): () => void;
  emit(event: string, data: unknown): void;
}
export function registerSelectionService(
  bus: SelectionEventBus,
  sessionId: string,
  handler: (request: SelectionRequest) => Promise<SelectionDecision>,
): () => void {
  const lifetime = new AbortController();
  const off = bus.on(SELECT_EVENT, (value) => {
    if (!isRecord(value) || value.sessionId !== sessionId || value.result !== undefined) return;
    if (value.version !== 1 || !validRequest(value.request)) {
      value.result = Promise.resolve(unavailable("invalid_request"));
      return;
    }
    const request = value.request;
    const signal = AbortSignal.any([lifetime.signal, ...(request.signal ? [request.signal] : [])]);
    // Set the result synchronously. Async event listeners are deliberately not required.
    value.result = new Promise<SelectionDecision>((resolve) => {
      const abort = () => resolve(unavailable("cancelled", true));
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) {
        abort();
        signal.removeEventListener("abort", abort);
        return;
      }
      void Promise.resolve()
        .then(() => handler({ ...request, signal }))
        .then(resolve, () => resolve(unavailable("selector_failed")))
        .finally(() => signal.removeEventListener("abort", abort));
    });
  });
  return () => {
    lifetime.abort();
    off();
  };
}
export async function selectViaEvents(
  bus: SelectionEventBus,
  sessionId: string,
  request: SelectionRequest,
): Promise<SelectionDecision> {
  const event: SelectionEvent = { version: 1, sessionId, request };
  bus.emit(SELECT_EVENT, event);
  return event.result ?? unavailable("selector_unavailable");
}
