import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";

export interface DashboardRole {
  id: string;
  summary: string;
  description?: string;
}

export type DashboardAction =
  | {
      type:
        | "add"
        | "auto-setup"
        | "toggle-routing"
        | "toggle-session"
        | "reload"
        | "reset"
        | "status"
        | "close";
    }
  | { type: "edit" | "delete" | "use"; id: string };

export interface RoleDashboardOptions {
  roles: readonly DashboardRole[];
  routingEnabled: boolean;
  sessionMode: "auto" | "manual";
  baseline: string;
  configPath: string;
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
    const selected = this.options.roles[this.cursor];
    const routing = this.options.routingEnabled ? "on" : "off";
    const session = this.options.sessionMode === "auto" ? "automatic" : "paused";
    const rows = this.options.roles.flatMap((role, index) => {
      const current = index === this.cursor;
      const row = truncate(`${current ? "> " : "  "}${role.summary}`);
      const styled = current ? this.theme.fg("accent", row) : row;
      return role.description ? [styled, `    ${truncate(role.description)}`] : [styled];
    });
    return [
      this.theme.bold("Model Roles"),
      `Routing: ${routing} · This session: ${session}`,
      `Default: ${truncate(this.options.baseline)}`,
      "↑/↓ or j/k move · Enter edit · A add · U use · D delete",
      "P session pause/resume · G global on/off · S Auto Setup",
      "R reload · X reset · I status · Esc close",
      this.options.warning ? `Warning: ${this.options.warning}` : "",
      "",
      ...rows,
      selected?.id === "default" ? "Default role cannot be deleted." : "",
      "",
      `Config: ${this.options.configPath}`,
    ];
  }

  invalidate(): void {}

  handleInput(data: string): void {
    if (data === "\u001b[A" || data === "k") {
      this.cursor = Math.max(0, this.cursor - 1);
      return this.tui.requestRender();
    }
    if (data === "\u001b[B" || data === "j") {
      this.cursor = Math.min(this.options.roles.length - 1, this.cursor + 1);
      return this.tui.requestRender();
    }
    const actions: Record<string, DashboardAction> = {
      "\u001b": { type: "close" },
      q: { type: "close" },
      a: { type: "add" },
      p: { type: "toggle-session" },
      g: { type: "toggle-routing" },
      s: { type: "auto-setup" },
      r: { type: "reload" },
      x: { type: "reset" },
      i: { type: "status" },
    };
    const action = actions[data];
    if (action) return this.done(action);
    const selected = this.options.roles[this.cursor];
    if (!selected) return;
    if (data === "\r" || data === "\n") return this.done({ type: "edit", id: selected.id });
    if (data === "u") return this.done({ type: "use", id: selected.id });
    if (data === "d" && selected.id !== "default") this.done({ type: "delete", id: selected.id });
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
