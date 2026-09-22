import { LIMITS } from "../core/defaults.js";
import { isRecord } from "../core/model-identity.js";
import { boundedTailText, boundedText } from "../core/routing-context.js";
import type { RoutingContext } from "../core/types.js";

export interface ProjectionMetadata {
  included: Record<"user" | "assistant" | "summary", number>;
  omitted: Record<"tools" | "reasoning" | "images" | "custom" | "skillBodies", number>;
  messageLimit: boolean;
  byteLimit: boolean;
  observationsPartial: boolean;
  summaryFreshness: "unknown" | "not_present";
}
interface Scan {
  remaining: number;
  receipt: ProjectionMetadata;
}
function observe(scan: Scan): boolean {
  if (scan.remaining-- > 0) return true;
  scan.receipt.observationsPartial = true;
  return false;
}
/** Newest first, over already-retained context only. Never traverse arbitrary custom data. */
function* retainedMessages(entries: readonly unknown[], scan: Scan): Generator<unknown> {
  for (let index = entries.length - 1; index >= 0; index--) {
    if (!observe(scan)) return;
    const entry = entries[index];
    if (!isRecord(entry)) continue;
    if (entry.type === "message") yield entry.message;
    else if (entry.type === "compaction") {
      if (Array.isArray(entry.retainedTail)) {
        for (let tail = entry.retainedTail.length - 1; tail >= 0; tail--) {
          if (!observe(scan)) return;
          yield entry.retainedTail[tail];
        }
      }
      yield { role: "compactionSummary", summary: entry.summary };
    } else if (entry.type === "branch_summary")
      yield { role: "branchSummary", summary: entry.summary };
    else if (entry.type === "custom" || entry.type === "custom_message")
      scan.receipt.omitted.custom++;
  }
}
// Recognize Pi's skill envelope only. Unmarked templates remain visible dialogue.
function withoutSkillBody(text: string, scan: Scan): string {
  const skill =
    /^<skill name="([^"]+)" location="[^"]+">\n[\s\S]*?\n<\/skill>(?:\n\n([\s\S]+))?$/.exec(text);
  if (!skill) return text;
  scan.receipt.omitted.skillBodies++;
  return `/skill:${skill[1]}${skill[2] ? ` ${skill[2]}` : ""}`;
}
function toolCallText(block: Record<string, unknown>): string {
  try {
    return `[Tool call ${JSON.stringify({ name: block.name, arguments: block.arguments })}]`;
  } catch {
    return "[Tool call with unserializable arguments]";
  }
}
function visibleText(
  content: unknown,
  scan: Scan,
  mode: "conversation" | "full",
  prefix = "",
): { text: string; truncated: boolean } {
  const parts = prefix ? [prefix] : [];
  let truncated = false;
  const blocks = typeof content === "string" ? [{ type: "text", text: content }] : content;
  if (Array.isArray(blocks))
    for (const block of blocks) {
      if (!observe(scan)) {
        truncated = true;
        break;
      }
      if (!isRecord(block)) continue;
      if (block.type === "thinking") scan.receipt.omitted.reasoning++;
      else if (block.type === "toolCall") {
        if (mode === "full") parts.push(toolCallText(block));
        else scan.receipt.omitted.tools++;
      } else if (block.type === "image") scan.receipt.omitted.images++;
      if (block.type !== "text" || typeof block.text !== "string") continue;
      parts.push(mode === "full" ? block.text : withoutSkillBody(block.text, scan));
    }
  const source = parts.filter(Boolean).join("\n");
  const maxBytes = mode === "full" ? LIMITS.fullHistoryMessageBytes : LIMITS.historyMessageBytes;
  const text = mode === "full" ? boundedTailText(source, maxBytes) : boundedText(source, maxBytes);
  truncated ||= text.length < source.length;
  if (truncated) {
    scan.receipt.byteLimit = true;
    scan.receipt.observationsPartial = true;
  }
  return { text, truncated };
}
/** Projection-only receipt is deliberately separate from the strict direct API context. */
export function projectRoutingInput(
  entries: readonly unknown[],
  previousRole?: string,
  mode: "conversation" | "full" = "conversation",
): { context: RoutingContext; receipt: ProjectionMetadata } {
  const receipt: ProjectionMetadata = {
    included: { user: 0, assistant: 0, summary: 0 },
    omitted: { tools: 0, reasoning: 0, images: 0, custom: 0, skillBodies: 0 },
    messageLimit: false,
    byteLimit: false,
    observationsPartial: false,
    summaryFreshness: "not_present",
  };
  const scan: Scan = { remaining: 4096, receipt };
  const full = mode === "full";
  const messageLimit = full ? LIMITS.fullHistoryMessages : LIMITS.historyMessages;
  const byteLimit = full ? LIMITS.fullHistoryBytes : LIMITS.historyBytes;
  const context: RoutingContext = {
    version: 1,
    ...(full ? { mode: "full" as const } : {}),
    messages: [],
    truncated: false,
    ...(previousRole ? { previousRole } : {}),
  };
  let remaining: number = byteLimit;
  for (const message of retainedMessages(entries, scan)) {
    if (!isRecord(message)) continue;
    let kind: "user" | "assistant" | "summary" | undefined;
    let content: unknown;
    let prefix = "";
    if (message.role === "user" || message.role === "assistant") {
      kind = message.role;
      content = message.content;
    } else if (message.role === "compactionSummary" || message.role === "branchSummary") {
      kind = "summary";
      content = message.summary;
    } else if (full && message.role === "toolResult") {
      kind = "assistant";
      content = message.content;
      prefix = `[Tool result ${typeof message.toolName === "string" ? message.toolName : "unknown"}${message.isError === true ? " (error)" : ""}]`;
    } else if (full && message.role === "bashExecution" && message.excludeFromContext !== true) {
      kind = "assistant";
      content = `[Bash command]\n${typeof message.command === "string" ? message.command : ""}\n[Bash output]\n${typeof message.output === "string" ? message.output : ""}`;
    } else if (message.role === "toolResult" || message.role === "bashExecution")
      receipt.omitted.tools++;
    else if (message.role === "custom") receipt.omitted.custom++;
    if (!kind) continue;
    const visible = visibleText(content, scan, mode, prefix);
    if (!visible.text.trim()) continue;
    if (context.messages.length >= messageLimit || remaining === 0) {
      receipt.messageLimit = context.messages.length >= messageLimit;
      receipt.byteLimit ||= remaining === 0;
      receipt.observationsPartial = true;
      context.truncated = true;
      break;
    }
    const text = full
      ? boundedTailText(visible.text, remaining)
      : boundedText(visible.text, remaining);
    receipt.byteLimit ||= text.length < visible.text.length;
    context.truncated ||= visible.truncated || text.length < visible.text.length;
    if (text.trim()) {
      context.messages.push({ kind, text });
      receipt.included[kind]++;
    }
    remaining -= Buffer.byteLength(text);
  }
  context.truncated ||= receipt.observationsPartial;
  receipt.summaryFreshness = receipt.included.summary ? "unknown" : "not_present";
  context.messages.reverse();
  return { context, receipt };
}
/** Backward-compatible pure projection with default conversation exclusions. */
export function projectRoutingContext(
  entries: readonly unknown[],
  previousRole?: string,
  mode: "conversation" | "full" = "conversation",
): RoutingContext {
  return projectRoutingInput(entries, previousRole, mode).context;
}
