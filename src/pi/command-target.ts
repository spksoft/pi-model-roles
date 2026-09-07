import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type Command = ReturnType<ExtensionAPI["getCommands"]>[number];

/** Match Pi's command dispatch grammar without expanding or reading any resource. */
export function commandTarget(text: string, commands: readonly Command[]): Command | undefined {
  if (!text.startsWith("/")) return undefined;
  const space = text.indexOf(" ");
  const name = text.slice(1, space === -1 ? undefined : space);
  if (!name || /\s/.test(name) || /^model-roles(?::\d+)?$/.test(name)) return undefined;
  return commands.find((command) => command.name === name);
}

/** Compare public ownership metadata, not command names alone (numeric suffixes can move). */
export function sameCommandTarget(left: Command, right: Command | undefined): boolean {
  return (
    right !== undefined &&
    left.name === right.name &&
    left.source === right.source &&
    left.sourceInfo.path === right.sourceInfo.path &&
    left.sourceInfo.source === right.sourceInfo.source &&
    left.sourceInfo.scope === right.sourceInfo.scope &&
    left.sourceInfo.origin === right.sourceInfo.origin &&
    left.sourceInfo.baseDir === right.sourceInfo.baseDir
  );
}
