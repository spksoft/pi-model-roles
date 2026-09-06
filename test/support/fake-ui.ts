import type {
  ExtensionUIContext,
  KeybindingsManager as AppKeybindingsManager,
} from "@earendil-works/pi-coding-agent";
import {
  KeybindingsManager,
  TUI_KEYBINDINGS,
  type Component,
  type TUI,
} from "@earendil-works/pi-tui";
export function fakeUI() {
  const notifications: string[] = [];
  const statuses = new Map<string, string>();
  const answers: Array<string | boolean | undefined> = [];
  const customAnswers: unknown[] = [];
  const customRenders: string[][] = [];
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
      new Promise<unknown>((resolve, reject) => {
        let finished = false;
        let component: (Component & { dispose?: () => void }) | undefined;
        const done = (value: unknown) => {
          finished = true;
          component?.dispose?.();
          resolve(value);
        };
        const created = factory(
          { requestRender() {}, terminal: { rows: 24 } } as unknown as TUI,
          theme as unknown as ExtensionUIContext["theme"],
          new KeybindingsManager(TUI_KEYBINDINGS) as unknown as AppKeybindingsManager,
          done,
        );
        Promise.resolve(created).then((value) => {
          component = value;
          if (customAnswers.length) {
            const answer = customAnswers.shift();
            if (
              answer &&
              typeof answer === "object" &&
              "keys" in answer &&
              Array.isArray(answer.keys)
            ) {
              customRenders.push(component.render(80));
              for (const key of answer.keys) {
                component.handleInput?.(key);
                customRenders.push(component.render(80));
              }
              if (!finished)
                reject(
                  new Error(`Script did not close picker: ${component.render(80).join("\n")}`),
                );
            } else done(answer);
          } else if (cancelLoader) component.handleInput?.("\u001b");
        });
      }),
  } as unknown as ExtensionUIContext;
  return {
    ui,
    notifications,
    statuses,
    answers,
    customAnswers,
    customRenders,
    selections,
    get editor() {
      return editor;
    },
    cancelSelection() {
      cancelLoader = true;
    },
  };
}
