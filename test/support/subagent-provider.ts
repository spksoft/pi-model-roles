import type { Provider } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
/** Test-only bridge across Jiti's isolated module caches; never packed or auto-loaded. */
export default function fixtureProvider(pi: ExtensionAPI): void {
  const provider = Reflect.get(globalThis, Symbol.for("pi-model-roles.test-provider")) as
    | Provider
    | undefined;
  if (provider?.id !== "fixture") throw new Error("Missing isolated test provider");
  pi.registerProvider(provider);
}
