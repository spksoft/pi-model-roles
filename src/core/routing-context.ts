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
      (key) => !["version", "mode", "messages", "truncated", "previousRole"].includes(key),
    ) ||
    (value.mode !== undefined && value.mode !== "full") ||
    !Array.isArray(value.messages) ||
    value.messages.length >
      (value.mode === "full" ? LIMITS.fullHistoryMessages : LIMITS.historyMessages)
  )
    return false;
  if (
    value.previousRole !== undefined &&
    (typeof value.previousRole !== "string" ||
      !ROLE_ID.test(value.previousRole) ||
      RESERVED_IDS.has(value.previousRole))
  )
    return false;
  const messageLimit =
    value.mode === "full" ? LIMITS.fullHistoryMessageBytes : LIMITS.historyMessageBytes;
  const byteLimit = value.mode === "full" ? LIMITS.fullHistoryBytes : LIMITS.historyBytes;
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
    if (size > messageLimit) return false;
    bytes += size;
  }
  return bytes <= byteLimit;
}

export function routingMetadata(context?: RoutingContext): RoutingMetadata {
  return {
    mode: context?.mode === "full" ? "full" : context ? "conversation" : "prompt",
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

/** Preserve Unicode characters while retaining the newest UTF-8 bytes. */
export function boundedTailText(text: string, maxBytes: number): string {
  if (Buffer.byteLength(text) <= maxBytes) return text;
  const buffer = Buffer.from(text);
  let start = buffer.length - maxBytes;
  while (start < buffer.length && ((buffer[start] ?? 0) & 0xc0) === 0x80) start++;
  return buffer.subarray(start).toString("utf8");
}
