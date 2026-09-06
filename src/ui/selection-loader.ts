import { BorderedLoader, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { unavailable } from "../core/selection.js";
import type { SelectionDecision } from "../core/types.js";
export async function withSelectionLoader(
  ctx: ExtensionContext,
  controller: AbortController,
  work: () => Promise<SelectionDecision>,
): Promise<SelectionDecision> {
  return (
    (await ctx.ui.custom<SelectionDecision>((tui, theme, _keys, done) => {
      const loader = new BorderedLoader(
        tui,
        theme,
        "Selecting model role — Escape cancels submission",
      );
      let settled = false;
      const finish = (result: SelectionDecision) => {
        if (!settled) {
          settled = true;
          done(result);
        }
      };
      loader.onAbort = () => {
        controller.abort();
        finish(unavailable("cancelled", true));
      };
      void work().then(finish, () => finish(unavailable("selector_failed")));
      return loader;
    })) ?? unavailable("cancelled", true)
  );
}
