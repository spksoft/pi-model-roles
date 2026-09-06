import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
export function fakeUI() {
  const notifications: string[] = [];
  const statuses = new Map<string, string>();
  const answers: Array<string | boolean | undefined> = [];
  const selections: Array<{ title: string; options: string[] }> = [];
  let editor = "";
  let cancelLoader = false;
  const theme = {
    fg: (_color: string, value: string) => value,
    bg: (_color: string, value: string) => value,
    bold: (value: string) => value,
  };
  const ui = {
    setToolsExpanded: () => undefined,
    getToolsExpanded: () => false,
    setWidget: () => undefined,
    notify: (text: string) => notifications.push(text),
    setStatus: (key: string, value: string | undefined) => {
      if (value === undefined) statuses.delete(key);
      else statuses.set(key, value);
    },
    setEditorText: (text: string) => {
      editor = text;
    },
    getEditorText: () => editor,
    theme,
    select: async (title: string, options: string[]) => {
      selections.push({ title, options });
      return answers.shift();
    },
    input: async () => answers.shift(),
    editor: async () => answers.shift(),
    confirm: async () => answers.shift() ?? false,
    custom: (factory: Parameters<ExtensionUIContext["custom"]>[0]) =>
      new Promise<unknown>((resolve) => {
        let component: (Component & { dispose?: () => void }) | undefined;
        const done = (value: unknown) => {
          component?.dispose?.();
          resolve(value);
        };
        const created = factory(
          { requestRender() {} } as unknown as TUI,
          theme as unknown as ExtensionUIContext["theme"],
          {} as never,
          done,
        );
        Promise.resolve(created).then((value) => {
          component = value;
          if (cancelLoader) component.handleInput?.("\u001b");
        });
      }),
  } as unknown as ExtensionUIContext;
  return {
    ui,
    notifications,
    statuses,
    answers,
    selections,
    get editor() {
      return editor;
    },
    cancelSelection() {
      cancelLoader = true;
    },
  };
}
