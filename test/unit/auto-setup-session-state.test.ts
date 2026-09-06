import assert from "node:assert/strict";
import { test } from "node:test";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  AUTO_SETUP_ENTRY,
  AUTO_SETUP_ENTRY_PREFIX,
  restoreAutoSetupDraft,
} from "../../src/pi/auto-setup-state.js";

const model = { provider: "fixture", id: "default" };
const candidate = { ref: model, efforts: ["off", "high"], images: false, contextWindow: 1000 };

function ready() {
  return {
    version: 1,
    requestId: "12345678-test",
    state: "ready",
    draft: {
      version: 1,
      requestId: "12345678-test",
      baseRevision: "revision",
      candidates: [candidate],
      researchModel: model,
      receivedAt: "2026-01-01T00:00:00.000Z",
      proposal: {
        version: 1,
        summary: "Offline report.",
        assessments: [
          {
            model,
            status: "offline_knowledge",
            summary: "No web evidence.",
            sources: [],
            caveats: ["Synthetic."],
          },
        ],
        roles: [],
      },
    },
  };
}

function context(entries: unknown[]): ExtensionContext {
  return {
    sessionManager: {
      getBranch: () => entries,
    },
  } as unknown as ExtensionContext;
}

test("Auto Setup restores a ready draft only from a valid latest marker", () => {
  const result = restoreAutoSetupDraft(
    context([{ type: "custom", customType: AUTO_SETUP_ENTRY, data: ready() }]),
  );
  assert.equal(result.state, "ready");
  assert.equal(result.state === "ready" && result.draft.proposal.summary, "Offline report.");
});

test("Auto Setup fails closed when latest marker is malformed or superseding", () => {
  const valid = { type: "custom", customType: AUTO_SETUP_ENTRY, data: ready() };
  const malformed = { type: "custom", customType: AUTO_SETUP_ENTRY, data: { version: 999 } };
  assert.equal(restoreAutoSetupDraft(context([valid, malformed])).state, "invalid");
  const unknown = { type: "custom", customType: `${AUTO_SETUP_ENTRY_PREFIX}other:v2`, data: {} };
  assert.equal(restoreAutoSetupDraft(context([valid, unknown])).state, "invalid");
  const cancelled = {
    type: "custom",
    customType: AUTO_SETUP_ENTRY,
    data: { version: 1, requestId: "12345678-test", state: "cancelled" },
  };
  assert.equal(restoreAutoSetupDraft(context([valid, cancelled])).state, "cancelled");
});
