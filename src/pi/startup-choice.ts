const VALUE_FLAGS = new Set([
  "--mode",
  "--api-key",
  "--system-prompt",
  "--append-system-prompt",
  "--name",
  "-n",
  "--session",
  "--session-id",
  "--fork",
  "--session-dir",
  "--models",
  "--tools",
  "-t",
  "--exclude-tools",
  "-xt",
  "--export",
  "--extension",
  "-e",
  "--skill",
  "--prompt-template",
  "--theme",
  "--use-theme",
  "--tui-mode",
]);
/** Only recognizes Pi 0.85.1's documented value-bearing selection flags, not prompt substrings. */
export function hasStartupChoice(argv: readonly string[]): boolean {
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--") break;
    if (!arg) continue;
    if (["--model", "--provider", "--thinking"].includes(arg) && argv[index + 1] !== undefined)
      return true;
    if (VALUE_FLAGS.has(arg)) index++;
  }
  return false;
}
