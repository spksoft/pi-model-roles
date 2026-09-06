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
    },
    { requestRender() {} } as unknown as TUI,
    theme,
    done,
  );
}

test("role settings put Auto Setup first and expose only CRUD actions", () => {
  const actions: unknown[] = [];
  const component = dashboard((action) => actions.push(action));
  const text = component.render(100).join("\n");
  assert.ok(text.indexOf("Auto Setup") < text.indexOf("Roles\n"));
  assert.match(text, /Enter open\/edit · A add · D delete/);
  assert.doesNotMatch(text, /use|pause|global|reload|reset|status/i);
  component.handleInput("\r");
  component.handleInput("a");
  assert.deepEqual(actions, [{ type: "auto-setup" }, { type: "add" }]);
});

test("role settings edit and delete a custom role without unrelated operations", () => {
  const actions: unknown[] = [];
  const component = dashboard((action) => actions.push(action));
  component.handleInput("j");
  component.handleInput("j");
  component.handleInput("\r");
  component.handleInput("u");
  component.handleInput("d");
  assert.deepEqual(actions, [
    { type: "edit", id: "quick" },
    { type: "delete", id: "quick" },
  ]);
});

test("role settings never offer delete for the default role", () => {
  const actions: unknown[] = [];
  const component = dashboard((action) => actions.push(action));
  component.handleInput("j");
  component.handleInput("d");
  assert.deepEqual(actions, []);
  assert.match(component.render(100).join("\n"), /Default role cannot be deleted/);
});
