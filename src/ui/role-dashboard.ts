import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";

export interface DashboardRole {
  id: string;
  summary: string;
  description?: string;
}

export type DashboardAction =
  | { type: "add" | "auto-setup" | "close" }
  | { type: "edit" | "delete"; id: string };

export interface RoleDashboardOptions {
  roles: readonly DashboardRole[];
  warning?: string;
}

export class RoleDashboard implements Component {
  private cursor = 0;

  constructor(
    private readonly options: RoleDashboardOptions,
    private readonly tui: TUI,
    private readonly theme: ExtensionUIContext["theme"],
    private readonly done: (action: DashboardAction) => void,
  ) {}

  render(width: number): string[] {
    const truncate = (value: string) =>
      value.length > width - 4 ? `${value.slice(0, Math.max(1, width - 5))}…` : value;
    const autoSetupSelected = this.cursor === 0;
    const selected = this.options.roles[this.cursor - 1];
    const rows = this.options.roles.flatMap((role, index) => {
      const current = index + 1 === this.cursor;
      const row = truncate(`${current ? "> " : "  "}${role.summary}`);
      const styled = current ? this.theme.fg("accent", row) : row;
      return role.description ? [styled, `    ${truncate(role.description)}`] : [styled];
    });
    const autoSetup = `${autoSetupSelected ? "> " : "  "}Auto Setup — research role recommendations`;
    return [
      this.theme.bold("Model Role Settings"),
      autoSetupSelected ? this.theme.fg("accent", truncate(autoSetup)) : truncate(autoSetup),
      "",
      "Roles",
      ...rows,
      selected?.id === "default" ? "Default role cannot be deleted." : "",
      "",
      "↑/↓ or j/k move · Enter open/edit · A add · D delete · Esc close",
      this.options.warning ? `Warning: ${this.options.warning}` : "",
    ];
  }

  invalidate(): void {}

  handleInput(data: string): void {
    if (data === "\u001b[A" || data === "k") {
      this.cursor = Math.max(0, this.cursor - 1);
      return this.tui.requestRender();
    }
    if (data === "\u001b[B" || data === "j") {
      this.cursor = Math.min(this.options.roles.length, this.cursor + 1);
      return this.tui.requestRender();
    }
    if (data === "\u001b" || data === "q") return this.done({ type: "close" });
    if (data === "a") return this.done({ type: "add" });
    const selected = this.options.roles[this.cursor - 1];
    if (data === "\r" || data === "\n") {
      if (this.cursor === 0) return this.done({ type: "auto-setup" });
      if (selected) return this.done({ type: "edit", id: selected.id });
    }
    if (data === "d" && selected && selected.id !== "default")
      this.done({ type: "delete", id: selected.id });
  }
}

export async function showRoleDashboard(
  ui: ExtensionUIContext,
  options: RoleDashboardOptions,
): Promise<DashboardAction> {
  return ui.custom<DashboardAction>(
    (tui, theme, _keybindings, done) => new RoleDashboard(options, tui, theme, done),
  );
}
