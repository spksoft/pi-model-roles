import { LIMITS } from "../core/defaults.js";
import { isRecord } from "../core/model-identity.js";
import { boundedText } from "../core/routing-context.js";
import type { RoutingContext } from "../core/types.js";

/** Newest first, over already-retained context only. Never traverse arbitrary custom data. */
function* retainedMessages(entries: readonly unknown[]): Generator<unknown> {
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index];
    if (!isRecord(entry)) continue;
    if (entry.type === "message") yield entry.message;
    else if (entry.type === "compaction") {
      if (Array.isArray(entry.retainedTail)) {
        for (let tail = entry.retainedTail.length - 1; tail >= 0; tail--)
          yield entry.retainedTail[tail];
      }
      yield { role: "compactionSummary", summary: entry.summary };
    } else if (entry.type === "branch_summary")
      yield { role: "branchSummary", summary: entry.summary };
  }
}

// Recognize Pi 0.85.1's skill envelope, not arbitrary XML. Unmarked template text
// cannot be distinguished from ordinary dialogue and is disclosed as possible history content.
function withoutSkillBody(text: string): string {
  const skill =
    /^<skill name="([^"]+)" location="[^"]+">\n[\s\S]*?\n<\/skill>(?:\n\n([\s\S]+))?$/.exec(text);
  return skill ? `/skill:${skill[1]}${skill[2] ? ` ${skill[2]}` : ""}` : text;
}

function visibleText(content: unknown): { text: string; truncated: boolean } {
  if (typeof content === "string") {
    const text = boundedText(withoutSkillBody(content), LIMITS.historyMessageBytes);
    return { text, truncated: text.length < content.length };
  }
  let text = "";
  let truncated = false;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (!isRecord(block) || block.type !== "text" || typeof block.text !== "string") continue;
      const room = LIMITS.historyMessageBytes - Buffer.byteLength(text);
      const cleaned = withoutSkillBody(block.text);
      const part = boundedText(cleaned, Math.max(0, room - (text ? 1 : 0)));
      text += (text && part ? "\n" : "") + part;
      truncated ||= part.length < block.text.length;
      // Removing a skill envelope is not a reason to discard later visible text blocks.
      if (part.length < cleaned.length) break;
    }
  }
  return { text, truncated };
}

/** Pure projection: no tools, file reads, reasoning, raw tool results, or extra model calls. */
export function projectRoutingContext(
  entries: readonly unknown[],
  previousRole?: string,
): RoutingContext {
  const context: RoutingContext = {
    version: 1,
    messages: [],
    truncated: false,
    ...(previousRole ? { previousRole } : {}),
  };
  let remaining: number = LIMITS.historyBytes;
  for (const message of retainedMessages(entries)) {
    if (!isRecord(message)) continue;
    const kind =
      message.role === "user" || message.role === "assistant"
        ? message.role
        : message.role === "compactionSummary" || message.role === "branchSummary"
          ? "summary"
          : undefined;
    if (!kind) continue;
    const visible = visibleText(kind === "summary" ? message.summary : message.content);
    if (!visible.text.trim()) continue;
    if (context.messages.length >= LIMITS.historyMessages || remaining === 0) {
      context.truncated = true;
      break;
    }
    const text = boundedText(visible.text, remaining);
    context.truncated ||= visible.truncated || text.length < visible.text.length;
    if (text.trim()) context.messages.push({ kind, text });
    remaining -= Buffer.byteLength(text);
  }
  context.messages.reverse();
  return context;
}
