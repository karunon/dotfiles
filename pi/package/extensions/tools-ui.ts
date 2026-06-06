import type { ExtensionAPI, ExtensionContext, ToolInfo } from "@earendil-works/pi-coding-agent";
import { getSettingsListTheme } from "@earendil-works/pi-coding-agent";
import { Container, type SettingItem, SettingsList } from "@earendil-works/pi-tui";

interface ToolsState {
  enabledTools: string[];
}

export default function toolsUi(pi: ExtensionAPI): void {
  let enabledTools = new Set<string>();
  let allTools: ToolInfo[] = [];

  function persistState(): void {
    pi.appendEntry<ToolsState>("tools-config", { enabledTools: Array.from(enabledTools) });
  }

  function applyTools(): void {
    pi.setActiveTools(Array.from(enabledTools));
  }

  function restoreFromBranch(ctx: ExtensionContext): void {
    allTools = pi.getAllTools();
    const knownToolNames = new Set(allTools.map((tool) => tool.name));
    let savedTools: string[] | undefined;

    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type !== "custom" || entry.customType !== "tools-config") continue;
      const data = entry.data as ToolsState | undefined;
      if (data?.enabledTools) savedTools = data.enabledTools;
    }

    if (savedTools) {
      enabledTools = new Set(savedTools.filter((tool) => knownToolNames.has(tool)));
      applyTools();
      return;
    }

    enabledTools = new Set(pi.getActiveTools());
  }

  pi.registerCommand("tools", {
    description: "Enable/disable tools for this session branch",
    handler: async (_args, ctx) => {
      allTools = pi.getAllTools();
      enabledTools = new Set(pi.getActiveTools());

      await ctx.ui.custom((tui, theme, _kb, done) => {
        const items: SettingItem[] = allTools.map((tool) => ({
          id: tool.name,
          label: tool.name,
          description: tool.description,
          currentValue: enabledTools.has(tool.name) ? "enabled" : "disabled",
          values: ["enabled", "disabled"],
        }));

        const container = new Container();
        container.addChild(
          new (class {
            render(_width: number) {
              return [theme.fg("accent", theme.bold("Tool Configuration")), theme.fg("dim", "Toggle tools. Changes apply immediately."), ""];
            }
            invalidate() {}
          })(),
        );

        const list = new SettingsList(
          items,
          Math.min(items.length + 3, 18),
          getSettingsListTheme(),
          (id, value) => {
            if (value === "enabled") enabledTools.add(id);
            else enabledTools.delete(id);
            applyTools();
            persistState();
          },
          () => done(undefined),
        );

        container.addChild(list);

        return {
          render(width: number) {
            return container.render(width);
          },
          invalidate() {
            container.invalidate();
          },
          handleInput(data: string) {
            list.handleInput?.(data);
            tui.requestRender();
          },
        };
      });
    },
  });

  pi.on("session_start", async (_event, ctx) => restoreFromBranch(ctx));
  pi.on("session_tree", async (_event, ctx) => restoreFromBranch(ctx));
}
