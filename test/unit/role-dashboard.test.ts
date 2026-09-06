import assert from "node:assert/strict";
import { test } from "node:test";
import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import { type DashboardAction, RoleDashboard } from "../../src/ui/role-dashboard.js";

const theme = {
  fg: (_color: string, value: string) => value,
  bold: (value: string) => value,
} as unknown as ExtensionUIContext["theme"];

function dashboard(done: (action: DashboardAction) => void) {
  return new RoleDashboard(
    {
      roles: [
        { id: "default", summary: "default · Pi default · inherit" },
        { id: "quick", summary: "quick · fixture/fast · low", description: "Small edits." },
      ],
      routingEnabled: true,
      sessionMode: "manual",
      baseline: "fixture/default · off",
      configPath: "/tmp/config.yaml",
    },
    { requestRender() {} } as unknown as TUI,
    theme,
    done,
  );
}

test("role dashboard presents plain-language routing state and direct actions", () => {
  const actions: unknown[] = [];
  const component = dashboard((action) => actions.push(action));
  const text = component.render(100).join("\n");
  assert.match(text, /Routing: on · This session: paused/);
  assert.match(text, /Enter edit · A add · U use · D delete/);
  component.handleInput("a");
  assert.deepEqual(actions, [{ type: "add" }]);
});

test("role dashboard edits, uses, and deletes a custom role without a submenu", () => {
  const actions: unknown[] = [];
  const component = dashboard((action) => actions.push(action));
  component.handleInput("j");
  component.handleInput("\r");
  component.handleInput("u");
  component.handleInput("d");
  assert.deepEqual(actions, [
    { type: "edit", id: "quick" },
    { type: "use", id: "quick" },
    { type: "delete", id: "quick" },
  ]);
});

test("role dashboard never offers delete for the default role", () => {
  const actions: unknown[] = [];
  const component = dashboard((action) => actions.push(action));
  component.handleInput("d");
  assert.deepEqual(actions, []);
  assert.match(component.render(100).join("\n"), /Default role cannot be deleted/);
});
