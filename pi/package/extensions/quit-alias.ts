import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function quitAlias(pi: ExtensionAPI): void {
  pi.registerCommand("q", {
    description: "Quit the current pi session",
    handler: async (_args, ctx) => {
      ctx.shutdown();
    },
  });
}
