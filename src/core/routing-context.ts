import { LIMITS, RESERVED_IDS, ROLE_ID } from "./defaults.js";
import { isRecord } from "./model-identity.js";
import type { RoutingContext, RoutingMetadata } from "./types.js";

/** Validate caller-supplied context separately; the v1 request/event contract stays unchanged. */
export function validRoutingContext(value: unknown): value is RoutingContext {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    typeof value.truncated !== "boolean" ||
    Object.keys(value).some(
      (key) => !["version", "messages", "truncated", "previousRole"].includes(key),
    ) ||
    !Array.isArray(value.messages) ||
    value.messages.length > LIMITS.historyMessages
  )
    return false;
  if (
    value.previousRole !== undefined &&
    (typeof value.previousRole !== "string" ||
      !ROLE_ID.test(value.previousRole) ||
      RESERVED_IDS.has(value.previousRole))
  )
    return false;
  let bytes = 0;
  for (const message of value.messages) {
    if (
      !isRecord(message) ||
      Object.keys(message).length !== 2 ||
      typeof message.kind !== "string" ||
      !["user", "assistant", "summary"].includes(message.kind) ||
      typeof message.text !== "string" ||
      !message.text.trim()
    )
      return false;
    const size = Buffer.byteLength(message.text);
    if (size > LIMITS.historyMessageBytes) return false;
    bytes += size;
  }
  return bytes <= LIMITS.historyBytes;
}

export function routingMetadata(context?: RoutingContext): RoutingMetadata {
  return {
    mode: context ? "conversation" : "prompt",
    messages: context?.messages.length ?? 0,
    historyBytes:
      context?.messages.reduce((sum, message) => sum + Buffer.byteLength(message.text), 0) ?? 0,
    truncated: context?.truncated ?? false,
  };
}

/** Preserve Unicode characters while bounding UTF-8 bytes, not JS string length. */
export function boundedText(text: string, maxBytes: number): string {
  if (Buffer.byteLength(text) <= maxBytes) return text;
  const buffer = Buffer.from(text);
  let end = maxBytes;
  // If the first omitted byte is a continuation, omit the entire partial character.
  while (end > 0 && ((buffer[end] ?? 0) & 0xc0) === 0x80) end--;
  return buffer.subarray(0, end).toString("utf8");
}
